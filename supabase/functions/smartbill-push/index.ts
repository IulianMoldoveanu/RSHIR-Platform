// Lane SMARTBILL-API — Edge Function `smartbill-push`.
//
// Three modes (all share the same shared-secret gate):
//   1. body.mode = 'pickup' → cron pickup; reads up to BATCH_SIZE PENDING jobs
//      across all tenants, processes each, respects per-tenant hourly cap.
//   2. body.mode = 'push' + {tenant_id, order_id, force?} → direct push for a
//      single order (used by manual "Reîncearcă" button).
//   3. body.mode = 'test' + {tenant_id} → dry test against the SmartBill API
//      using the tenant's saved credentials. Calls /SBORO/api/series (read-
//      only, lightweight) so a misconfigured username/token surfaces with
//      clear UI feedback before the operator enables auto-push.
//
// SmartBill API:
//   POST https://ws.smartbill.ro/SBORO/api/invoice  (creates invoice)
//   GET  https://ws.smartbill.ro/SBORO/api/series?cif=<CIF>  (test connection)
//   Auth: HTTP Basic — base64(username:api_token).
//
// Credentials:
//   - username, cif, series_invoice → tenants.settings.smartbill (jsonb)
//   - api_token (sensitive)         → Vault secret
//                                     `smartbill_api_token_<tenant_id>`
//   The Edge Function reads the token via vault.decrypted_secrets.
//
// Rate limit: max 100 push attempts per tenant per rolling hour
// (counts SENT + FAILED rows in smartbill_invoice_jobs).
//
// Auth header:
//   x-hir-notify-secret: <HIR_NOTIFY_SECRET>  (constant-time compare).
//
// Wrapped in withRunLog so a failed cron pickup shows up under
// /dashboard/admin/observability/function-runs.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { withRunLog } from '../_shared/log.ts';

const SMARTBILL_BASE = 'https://ws.smartbill.ro/SBORO/api';
const BATCH_SIZE = 25; // jobs handled per cron tick
const MAX_ATTEMPTS = 5;
const PER_TENANT_HOURLY_CAP = 100;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
}

function basicAuth(username: string, token: string): string {
  return 'Basic ' + btoa(`${username}:${token}`);
}

function safeStr(v: unknown, max = 1000): string {
  if (v === null || v === undefined) return '';
  return String(v).slice(0, max);
}

type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

type SmartbillSettings = {
  enabled: boolean;
  username: string;
  cif: string;
  series_invoice: string;
  auto_push_enabled: boolean;
};

function readSmartbillSettings(settings: unknown): SmartbillSettings | null {
  if (!settings || typeof settings !== 'object') return null;
  const sb = (settings as Record<string, unknown>).smartbill;
  if (!sb || typeof sb !== 'object') return null;
  const obj = sb as Record<string, unknown>;
  const username = typeof obj.username === 'string' ? obj.username.trim() : '';
  const cif = typeof obj.cif === 'string' ? obj.cif.trim().replace(/^RO/i, '') : '';
  const series = typeof obj.series_invoice === 'string' ? obj.series_invoice.trim() : '';
  const enabled = obj.enabled === true;
  const auto = obj.auto_push_enabled === true;
  if (!username || !cif || !series) return null;
  return {
    enabled,
    username,
    cif,
    series_invoice: series,
    auto_push_enabled: auto,
  };
}

type SupabaseClient = ReturnType<typeof createClient>;

async function fetchVaultSecret(
  supabase: SupabaseClient,
  name: string,
): Promise<string | null> {
  // We use the rpc helper because vault.decrypted_secrets is not in the
  // PostgREST schema cache. A tiny SECURITY DEFINER function is the
  // standard pattern; if it doesn't exist yet we return null and let the
  // caller surface a clear error.
  const { data, error } = await supabase.rpc('hir_read_vault_secret', {
    secret_name: name,
  });
  if (error) {
    console.warn('[smartbill-push] vault read error', error.message);
    return null;
  }
  return typeof data === 'string' && data.length > 0 ? data : null;
}

type Tenant = {
  id: string;
  name: string;
  settings: unknown;
};

type OrderRow = {
  id: string;
  tenant_id: string;
  total_ron: number | string | null;
  items: Json;
  created_at: string;
  customers: { first_name: string | null; last_name: string | null } | null;
};

type SmartbillItem = {
  name: string;
  code: string;
  isService: boolean;
  measuringUnitName: string;
  currency: string;
  quantity: number;
  price: number;
  isTaxIncluded: boolean;
  taxName: string;
  taxPercentage: number;
};

function buildInvoicePayload(
  tenant: Tenant,
  sb: SmartbillSettings,
  order: OrderRow,
  vatRatePct: number,
  legalName: string,
): Record<string, Json> {
  const total = Number(order.total_ron ?? 0);
  const customer = order.customers ?? null;
  const fullName =
    `${customer?.first_name ?? 'Client'} ${customer?.last_name ?? 'persoană fizică'}`.trim() ||
    'Client persoană fizică';

  // Single-line invoice using order total. Mirrors the CSV-export shape
  // from PR #286 — accountants can split per product line later if needed.
  const items: SmartbillItem[] = [
    {
      name: 'Servicii livrare comandă',
      code: order.id.slice(0, 8).toUpperCase(),
      isService: true,
      measuringUnitName: 'buc',
      currency: 'RON',
      quantity: 1,
      price: Number(total.toFixed(2)),
      isTaxIncluded: true,
      taxName: 'Normala',
      taxPercentage: vatRatePct,
    },
  ];

  // SmartBill expects ISO yyyy-mm-dd in `issueDate`. Use the order's
  // creation day in Europe/Bucharest so an order placed at 23:30 on Jan 31
  // doesn't fall into February.
  const issueDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(order.created_at));

  return {
    companyVatCode: sb.cif,
    client: {
      name: fullName,
      vatCode: '',
      isTaxPayer: false,
      country: 'Romania',
      // SmartBill requires a city for invoices; "Brașov" is a safe placeholder
      // for delivery customers. Accountants edit B2B clients post-import.
      city: 'Brașov',
      saveToDb: false,
    },
    issueDate,
    seriesName: sb.series_invoice,
    isDraft: false,
    dueDate: issueDate,
    deliveryDate: issueDate,
    products: items,
    payment: {
      value: Number(total.toFixed(2)),
      paymentSeries: '',
      type: 'Card',
      isCash: false,
    },
    observations: `HIR Restaurant Suite — comandă #${order.id.slice(0, 8)} (${legalName}).`,
  };
}

async function callSmartbillCreateInvoice(
  sb: SmartbillSettings,
  apiToken: string,
  payload: Record<string, Json>,
): Promise<
  | { ok: true; invoiceId: string; invoiceNumber: string; series: string }
  | { ok: false; status: number; errorText: string }
> {
  let res: Response;
  try {
    res = await fetch(`${SMARTBILL_BASE}/invoice`, {
      method: 'POST',
      headers: {
        Authorization: basicAuth(sb.username, apiToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return { ok: false, status: 0, errorText: `network: ${(e as Error).message}` };
  }

  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, errorText: safeStr(text, 1000) };
  }
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      status: res.status,
      errorText: 'invalid_smartbill_response: ' + safeStr(text, 200),
    };
  }
  // SmartBill error envelope: { errorText: "..." } even with HTTP 200.
  if (typeof parsed.errorText === 'string' && parsed.errorText.length > 0) {
    return { ok: false, status: res.status, errorText: safeStr(parsed.errorText, 1000) };
  }
  const invoiceNumber = safeStr(parsed.number, 64);
  const series = safeStr(parsed.series, 64);
  return {
    ok: true,
    invoiceId: `${series}${invoiceNumber}`,
    invoiceNumber,
    series,
  };
}

async function callSmartbillTestSeries(
  sb: SmartbillSettings,
  apiToken: string,
): Promise<{ ok: true } | { ok: false; status: number; errorText: string }> {
  let res: Response;
  try {
    res = await fetch(
      `${SMARTBILL_BASE}/series?cif=${encodeURIComponent(sb.cif)}`,
      {
        method: 'GET',
        headers: {
          Authorization: basicAuth(sb.username, apiToken),
          Accept: 'application/json',
        },
      },
    );
  } catch (e) {
    return { ok: false, status: 0, errorText: `network: ${(e as Error).message}` };
  }
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, errorText: safeStr(text, 500) };
  }
  // SmartBill returns 200 with errorText set on auth failures.
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (typeof parsed.errorText === 'string' && parsed.errorText.length > 0) {
      return { ok: false, status: res.status, errorText: safeStr(parsed.errorText, 500) };
    }
  } catch {
    return { ok: false, status: res.status, errorText: 'invalid_response' };
  }
  return { ok: true };
}

async function tenantHourlyCount(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('smartbill_invoice_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('updated_at', since)
    .in('status', ['SENT', 'FAILED']);
  if (error) {
    console.warn('[smartbill-push] hourly count error', error.message);
    return 0;
  }
  return count ?? 0;
}

async function processJob(
  supabase: SupabaseClient,
  jobId: string,
  tenantId: string,
  orderId: string,
): Promise<{ status: 'SENT' | 'FAILED' | 'SKIPPED'; detail: string }> {
  // Hourly cap.
  const used = await tenantHourlyCount(supabase, tenantId);
  if (used >= PER_TENANT_HOURLY_CAP) {
    return { status: 'SKIPPED', detail: 'rate_limit_hourly_cap' };
  }

  // Tenant + settings + fiscal.
  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, name, settings')
    .eq('id', tenantId)
    .maybeSingle();
  if (tenantErr || !tenant) {
    return { status: 'FAILED', detail: 'tenant_not_found' };
  }
  const sb = readSmartbillSettings((tenant as Tenant).settings);
  if (!sb) {
    return { status: 'FAILED', detail: 'smartbill_config_incomplete' };
  }
  if (!sb.enabled) {
    return { status: 'SKIPPED', detail: 'smartbill_disabled' };
  }

  const settingsObj =
    (tenant as Tenant).settings && typeof (tenant as Tenant).settings === 'object'
      ? ((tenant as Tenant).settings as Record<string, unknown>)
      : {};
  const fiscalRaw = settingsObj.fiscal as Record<string, unknown> | undefined;
  const vatRatePct =
    fiscalRaw && typeof fiscalRaw.vat_rate_pct === 'number' ? fiscalRaw.vat_rate_pct : 11;
  const legalName =
    fiscalRaw && typeof fiscalRaw.legal_name === 'string' && fiscalRaw.legal_name
      ? (fiscalRaw.legal_name as string)
      : ((tenant as Tenant).name ?? 'HIR Tenant');

  const apiToken = await fetchVaultSecret(
    supabase,
    `smartbill_api_token_${tenantId}`,
  );
  if (!apiToken) {
    return { status: 'FAILED', detail: 'api_token_missing' };
  }

  // Order.
  const { data: order, error: orderErr } = await supabase
    .from('restaurant_orders')
    .select(
      `id, tenant_id, total_ron, items, created_at,
       customers ( first_name, last_name )`,
    )
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (orderErr || !order) {
    return { status: 'FAILED', detail: 'order_not_found' };
  }

  const payload = buildInvoicePayload(
    tenant as Tenant,
    sb,
    order as unknown as OrderRow,
    vatRatePct,
    legalName,
  );
  const result = await callSmartbillCreateInvoice(sb, apiToken, payload);
  if (!result.ok) {
    return {
      status: 'FAILED',
      detail: `http_${result.status}: ${result.errorText}`,
    };
  }
  // Persist invoice ids on the job and bump tenant.last_sync_at.
  await supabase
    .from('smartbill_invoice_jobs')
    .update({
      smartbill_invoice_id: result.invoiceId,
      smartbill_invoice_number: result.invoiceNumber,
      smartbill_invoice_series: result.series,
    })
    .eq('id', jobId);
  await supabase
    .from('tenants')
    .update({
      settings: {
        ...settingsObj,
        smartbill: {
          ...((settingsObj.smartbill as Record<string, unknown>) ?? {}),
          last_sync_at: new Date().toISOString(),
        },
      },
    })
    .eq('id', tenantId);

  return { status: 'SENT', detail: result.invoiceId };
}

async function bumpAttempts(
  supabase: SupabaseClient,
  jobId: string,
  status: 'SENT' | 'FAILED' | 'SKIPPED',
  detail: string,
): Promise<void> {
  // SKIPPED (rate-limit / config-disabled) does NOT consume a retry attempt
  // — the condition is transient and the job must be re-eligible on the
  // next pickup. Otherwise it would burn through MAX_ATTEMPTS in 5 cron
  // ticks and become permanently stranded as PENDING (caught by Codex P1
  // on PR #316).
  const { data: row } = await supabase
    .from('smartbill_invoice_jobs')
    .select('attempts')
    .eq('id', jobId)
    .maybeSingle();
  const currentAttempts = (row as { attempts?: number } | null)?.attempts ?? 0;
  if (status === 'SKIPPED') {
    await supabase
      .from('smartbill_invoice_jobs')
      .update({
        status: 'PENDING',
        error_text: detail,
      })
      .eq('id', jobId);
    return;
  }
  await supabase
    .from('smartbill_invoice_jobs')
    .update({
      status,
      attempts: currentAttempts + 1,
      error_text: status === 'SENT' ? null : detail,
    })
    .eq('id', jobId);
}

/**
 * Atomic claim — flips PENDING → CLAIMED for exactly one row. Returns true
 * iff this caller won the race; concurrent pickups (or a manual push that
 * ran in parallel with cron) will see the row already CLAIMED/SENT/FAILED
 * and back off. Without this guard, two ticks reading the same PENDING row
 * before either updates would both POST to SmartBill and create duplicate
 * invoices for the same order (caught by Codex P1 on PR #316).
 */
async function claimJob(
  supabase: SupabaseClient,
  jobId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('smartbill_invoice_jobs')
    .update({ status: 'CLAIMED' })
    .eq('id', jobId)
    .eq('status', 'PENDING')
    .select('id');
  if (error) {
    console.warn('[smartbill-push] claim failed', jobId, error.message);
    return false;
  }
  return Array.isArray(data) && data.length === 1;
}

/**
 * Release a CLAIMED row back to PENDING — used when the function throws
 * mid-processing (network blip, OOM, ...) so the next cron tick can retry.
 * Only flips CLAIMED → PENDING; if the row was already moved to a terminal
 * state by `bumpAttempts`, this is a no-op.
 */
async function releaseClaim(
  supabase: SupabaseClient,
  jobId: string,
): Promise<void> {
  await supabase
    .from('smartbill_invoice_jobs')
    .update({ status: 'PENDING' })
    .eq('id', jobId)
    .eq('status', 'CLAIMED');
}

Deno.serve(async (req: Request) => {
  return withRunLog('smartbill-push', async ({ setMetadata }) => {
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

    // Shared-secret gate (constant-time).
    const expected = Deno.env.get('HIR_NOTIFY_SECRET');
    if (!expected) {
      return json(500, { error: 'secret_not_configured' });
    }
    const got = req.headers.get('x-hir-notify-secret') ?? '';
    if (got.length !== expected.length) return json(401, { error: 'unauthorized' });
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
    }
    if (diff !== 0) return json(401, { error: 'unauthorized' });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json(500, { error: 'supabase_env_missing' });
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'invalid_json' });
    }
    const mode =
      typeof body.mode === 'string' ? body.mode : 'pickup';

    // -----------------------------------------------------------------
    // Mode: TEST — dry connectivity check, never enqueues.
    // -----------------------------------------------------------------
    if (mode === 'test') {
      const tenantId = body.tenant_id;
      if (!isUuid(tenantId)) return json(400, { error: 'invalid_tenant_id' });
      setMetadata({ tenant_id: tenantId, mode: 'test' });

      const { data: tenant } = await supabase
        .from('tenants')
        .select('settings')
        .eq('id', tenantId)
        .maybeSingle();
      const sb = readSmartbillSettings((tenant as Tenant | null)?.settings);
      if (!sb) {
        return json(200, { ok: false, error: 'smartbill_config_incomplete' });
      }
      const apiToken = await fetchVaultSecret(
        supabase,
        `smartbill_api_token_${tenantId}`,
      );
      if (!apiToken) {
        return json(200, { ok: false, error: 'api_token_missing' });
      }
      const r = await callSmartbillTestSeries(sb, apiToken);
      // Persist last_test_status on the tenant for the UI badge.
      const settingsObj =
        (tenant as Tenant | null)?.settings && typeof (tenant as Tenant | null)!.settings === 'object'
          ? ((tenant as Tenant).settings as Record<string, unknown>)
          : {};
      await supabase
        .from('tenants')
        .update({
          settings: {
            ...settingsObj,
            smartbill: {
              ...((settingsObj.smartbill as Record<string, unknown>) ?? {}),
              last_test_status: r.ok ? 'OK' : 'FAILED',
              last_test_at: new Date().toISOString(),
            },
          },
        })
        .eq('id', tenantId);
      return r.ok
        ? json(200, { ok: true })
        : json(200, { ok: false, error: r.errorText, status: r.status });
    }

    // -----------------------------------------------------------------
    // Mode: PUSH — single order.
    // -----------------------------------------------------------------
    if (mode === 'push') {
      const tenantId = body.tenant_id;
      const orderId = body.order_id;
      if (!isUuid(tenantId) || !isUuid(orderId)) {
        return json(400, { error: 'invalid_ids' });
      }
      setMetadata({ tenant_id: tenantId, order_id: orderId, mode: 'push' });

      // Upsert a job row (or pick existing) so manual pushes show up in UI.
      const { data: existing } = await supabase
        .from('smartbill_invoice_jobs')
        .select('id, attempts, status')
        .eq('tenant_id', tenantId)
        .eq('order_id', orderId)
        .maybeSingle();

      let jobId: string;
      if (existing) {
        jobId = (existing as { id: string }).id;
        const existingStatus = (existing as { status: string }).status;
        if (existingStatus === 'SENT' && body.force !== true) {
          return json(200, { ok: true, skipped: 'already_sent' });
        }
        // If a row is currently CLAIMED by a cron tick, refuse so we don't
        // double-post. The button can be retried in a few seconds.
        if (existingStatus === 'CLAIMED') {
          return json(200, { ok: false, status: 'busy', detail: 'job_in_progress' });
        }
        // For FAILED rows that the OWNER is force-pushing, flip back to
        // PENDING first so the claim-update sees a transitional row.
        if (existingStatus !== 'PENDING') {
          await supabase
            .from('smartbill_invoice_jobs')
            .update({ status: 'PENDING', error_text: null })
            .eq('id', jobId);
        }
      } else {
        const { data: ins, error: insErr } = await supabase
          .from('smartbill_invoice_jobs')
          .insert({ tenant_id: tenantId, order_id: orderId, status: 'PENDING' })
          .select('id')
          .single();
        if (insErr || !ins) {
          return json(500, { error: 'job_insert_failed', detail: insErr?.message });
        }
        jobId = (ins as { id: string }).id;
      }

      // Atomic claim — same guard as the cron pickup path.
      const won = await claimJob(supabase, jobId);
      if (!won) {
        return json(200, { ok: false, status: 'busy', detail: 'lost_claim_race' });
      }
      try {
        const r = await processJob(supabase, jobId, tenantId, orderId);
        await bumpAttempts(supabase, jobId, r.status, r.detail);
        setMetadata({ result_status: r.status });
        return json(200, { ok: r.status === 'SENT', status: r.status, detail: r.detail });
      } catch (e) {
        await releaseClaim(supabase, jobId);
        const msg = e instanceof Error ? e.message : String(e);
        await bumpAttempts(supabase, jobId, 'FAILED', `throw: ${msg.slice(0, 200)}`);
        return json(500, { ok: false, status: 'FAILED', detail: msg.slice(0, 200) });
      }
    }

    // -----------------------------------------------------------------
    // Mode: PICKUP (default) — cron tick.
    // -----------------------------------------------------------------
    setMetadata({ mode: 'pickup' });
    const { data: pending, error } = await supabase
      .from('smartbill_invoice_jobs')
      .select('id, tenant_id, order_id, attempts')
      .eq('status', 'PENDING')
      .lt('attempts', MAX_ATTEMPTS)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);
    if (error) {
      return json(500, { error: 'pickup_query_failed', detail: error.message });
    }
    const jobs = (pending ?? []) as Array<{
      id: string;
      tenant_id: string;
      order_id: string;
      attempts: number;
    }>;
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let raced = 0;
    for (const j of jobs) {
      // Atomic CLAIM before any external API call. If another tick (or a
      // concurrent manual push) already claimed it, skip silently.
      const won = await claimJob(supabase, j.id);
      if (!won) {
        raced++;
        continue;
      }
      try {
        const r = await processJob(supabase, j.id, j.tenant_id, j.order_id);
        await bumpAttempts(supabase, j.id, r.status, r.detail);
        if (r.status === 'SENT') sent++;
        else if (r.status === 'FAILED') failed++;
        else skipped++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Release claim back to PENDING — bumpAttempts only fires on
        // catchable processJob errors, so a thrown error mid-flight could
        // otherwise leave a row CLAIMED forever. Then mark as FAILED with
        // the actual error so the operator can see what happened.
        await releaseClaim(supabase, j.id);
        await bumpAttempts(supabase, j.id, 'FAILED', `throw: ${msg.slice(0, 200)}`);
        failed++;
      }
    }
    setMetadata({
      picked: jobs.length,
      sent,
      failed,
      skipped,
      raced,
    });
    return json(200, { ok: true, picked: jobs.length, sent, failed, skipped, raced });
  });
});
