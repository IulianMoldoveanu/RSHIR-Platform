// Edge Function: aggregator-email-parser
//
// Lane AGGREGATOR-EMAIL-INTAKE — Phase 2 / PR 2 of 3.
//
// Receives a forwarded restaurant order-confirmation email from Glovo,
// Wolt, or Bolt Food (relayed by a Cloudflare Email Worker watching
// `*@orders.hir.ro`). Resolves the recipient alias → tenant. Stores the
// raw email body in the private `aggregator-emails` storage bucket.
// Inserts an `aggregator_email_jobs` audit row. If the sender domain
// matches a known aggregator, calls Anthropic to parse line items +
// totals and (eventually) inserts a `restaurant_orders` row with
// source IN ('GLOVO','WOLT','BOLT_FOOD').
//
// **Webhook contract** (POST application/json, verify_jwt = false):
//   {
//     "to": "comenzi-foisorul-a@orders.hir.ro",
//     "from": "noreply@glovoapp.com",
//     "subject": "Comandă nouă #12345",
//     "text": "...email plain-text body...",
//     "html": "...optional html body..."
//   }
// Auth: query param ?token=<aggregator_intake_aliases.secret> mapped to
// the resolved alias. Without a matching token we 401 (defense against
// alias-only spoofing — the secret lives in the Cloudflare Worker config).
//
// Per-tenant rate limit: max 200 jobs / 24 h via a count check before
// insert. Defensive against a runaway forwarding loop.
//
// ADDITIVE — no existing code path is altered. The downstream
// restaurant_orders insert path is the same one used by manual order
// creation (no new ledger or accounting glue).
//
// Env (set as Supabase function secrets):
//   ANTHROPIC_API_KEY   — required for parsing; if missing, jobs land
//                          as PARSED-pending-manual-review with a
//                          Romanian error_text instead of failing hard
//                          (graceful degradation, mirrors PR #297).
//   ANTHROPIC_MODEL     — defaults to claude-sonnet-4-5-20250929.
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { withRunLog } from '../_shared/log.ts';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const RATE_LIMIT_PER_24H = 200;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

type IncomingEmail = {
  to: string;
  from: string;
  subject?: string;
  text?: string;
  html?: string;
};

type DetectedSource = 'GLOVO' | 'WOLT' | 'BOLT_FOOD' | null;

type ParsedOrder = {
  external_order_id: string | null;
  items: Array<{ name: string; quantity: number; unit_price_ron: number; modifiers: string | null }>;
  subtotal_ron: number;
  delivery_fee_ron: number;
  total_ron: number;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  scheduled_for: string | null;
  notes: string | null;
};

function detectSource(senderEmail: string): DetectedSource {
  const e = senderEmail.toLowerCase();
  if (/@(.*\.)?glovoapp\.com$|@(.*\.)?glovo\.com$/.test(e)) return 'GLOVO';
  if (/@(.*\.)?wolt\.com$/.test(e)) return 'WOLT';
  if (/@(.*\.)?bolt\.eu$|@(.*\.)?bolt-food\.com$/.test(e)) return 'BOLT_FOOD';
  return null;
}

function extractAliasLocal(toAddress: string): string | null {
  // accepts "Comenzi <comenzi-x@orders.hir.ro>" or bare "comenzi-x@orders.hir.ro"
  const m = toAddress.match(/<?([a-z0-9][a-z0-9-]{2,38}[a-z0-9])@orders\.hir\.ro>?/i);
  return m ? m[1].toLowerCase() : null;
}

function safeFromEmail(raw: string): string {
  // "Glovo Romania <noreply@glovoapp.com>" → "noreply@glovoapp.com"
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim().toLowerCase();
}

function buildParserPrompt(source: DetectedSource, body: string): string {
  return [
    'Esti un parser de email-uri de comanda pentru restaurante din Romania.',
    `Sursa: ${source}.`,
    'Returneaza STRICT un singur obiect JSON (fara text in plus, fara markdown), cu schema:',
    '{',
    '  "external_order_id": string|null,',
    '  "items": [{"name": string, "quantity": int, "unit_price_ron": number, "modifiers": string|null}],',
    '  "subtotal_ron": number,',
    '  "delivery_fee_ron": number,',
    '  "total_ron": number,',
    '  "customer_name": string|null,',
    '  "customer_phone": string|null,',
    '  "delivery_address": string|null,',
    '  "scheduled_for": string|null,',
    '  "notes": string|null',
    '}',
    'Reguli:',
    '- preturile in RON ca numere (ex: 39.50)',
    '- daca un camp lipseste, foloseste null',
    '- nu inventa valori',
    '',
    'Corp email:',
    body.slice(0, 12000), // hard cap to keep tokens bounded
  ].join('\n');
}

async function callAnthropicParser(
  apiKey: string,
  model: string,
  source: DetectedSource,
  body: string,
): Promise<{ parsed: ParsedOrder; cost_usd: number }> {
  const prompt = buildParserPrompt(source, body);
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`anthropic_${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const text: string =
    Array.isArray(data?.content) && data.content[0]?.type === 'text' ? data.content[0].text : '';
  if (!text) throw new Error('anthropic_empty_response');

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: ParsedOrder;
  try {
    parsed = JSON.parse(cleaned) as ParsedOrder;
  } catch {
    throw new Error(`anthropic_unparseable_json: ${cleaned.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed.items)) throw new Error('anthropic_bad_shape: missing items[]');

  const usage = data?.usage ?? {};
  const inTok = Number(usage.input_tokens ?? 0);
  const outTok = Number(usage.output_tokens ?? 0);
  const cost = (inTok * 3.0 + outTok * 15.0) / 1_000_000;
  return { parsed, cost_usd: cost };
}

function highConfidence(p: ParsedOrder): boolean {
  // Auto-apply criteria: at least one item, total > 0, total ≈ subtotal +
  // delivery_fee within 5%. Below this the job stays PARSED for manual review.
  if (!p.items?.length) return false;
  if (!p.total_ron || p.total_ron <= 0) return false;
  const computed = (p.subtotal_ron ?? 0) + (p.delivery_fee_ron ?? 0);
  if (computed <= 0) return false;
  const drift = Math.abs(p.total_ron - computed) / p.total_ron;
  return drift <= 0.05;
}

Deno.serve(async (req) => {
  return withRunLog('aggregator-email-parser', async ({ setMetadata }) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

    const url = new URL(req.url);
    const token = url.searchParams.get('token') ?? '';

    let payload: IncomingEmail;
    try {
      payload = (await req.json()) as IncomingEmail;
    } catch {
      return json(400, { error: 'invalid_json' });
    }

    if (!payload?.to || !payload?.from) return json(400, { error: 'missing_to_or_from' });

    const aliasLocal = extractAliasLocal(payload.to);
    if (!aliasLocal) return json(400, { error: 'invalid_to_address' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) return json(500, { error: 'env_missing_supabase' });
    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Resolve alias → tenant + secret check.
    const { data: alias, error: aliasErr } = await sb
      .from('aggregator_intake_aliases')
      .select('tenant_id, secret, enabled')
      .eq('alias_local', aliasLocal)
      .maybeSingle();
    if (aliasErr) return json(500, { error: 'alias_lookup_failed', detail: aliasErr.message });
    if (!alias) return json(404, { error: 'alias_not_found' });
    if (!alias.enabled) return json(403, { error: 'alias_disabled' });
    if (!token || token !== alias.secret) return json(401, { error: 'invalid_token' });

    const tenantId = alias.tenant_id as string;
    setMetadata({ tenant_id: tenantId, alias_local: aliasLocal });

    // Per-tenant 24h rate limit.
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count: recentCount, error: countErr } = await sb
      .from('aggregator_email_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('received_at', since);
    if (countErr) return json(500, { error: 'rate_check_failed', detail: countErr.message });
    if ((recentCount ?? 0) >= RATE_LIMIT_PER_24H) {
      return json(429, { error: 'rate_limit_exceeded', limit: RATE_LIMIT_PER_24H });
    }

    const senderEmail = safeFromEmail(payload.from);
    const detected = detectSource(senderEmail);
    const subject = (payload.subject ?? '').slice(0, 500);
    const bodyText = (payload.text ?? payload.html ?? '').slice(0, 50000);

    // 1) Insert RECEIVED row (without raw_email_path yet — we need the id to key the file).
    const { data: jobRow, error: jobErr } = await sb
      .from('aggregator_email_jobs')
      .insert({
        tenant_id: tenantId,
        sender: senderEmail,
        subject,
        status: detected ? 'RECEIVED' : 'SKIPPED',
        detected_source: detected,
        error_text: detected ? null : 'sender_domain_not_recognized',
      })
      .select('id')
      .single();
    if (jobErr || !jobRow) return json(500, { error: 'job_insert_failed', detail: jobErr?.message });
    const jobId = jobRow.id as string;

    // 2) Save raw body to storage.
    const now = new Date();
    const path = `${tenantId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${jobId}.eml`;
    const rawDoc = `From: ${payload.from}\nTo: ${payload.to}\nSubject: ${subject}\n\n${bodyText}`;
    const { error: storeErr } = await sb.storage
      .from('aggregator-emails')
      .upload(path, new Blob([rawDoc], { type: 'message/rfc822' }), { upsert: false });
    if (storeErr) {
      // best-effort: continue, but record the failure on the job
      setMetadata({ storage_warning: storeErr.message });
    } else {
      await sb.from('aggregator_email_jobs').update({ raw_email_path: path }).eq('id', jobId);
    }

    // 3) If skipped, we're done.
    if (!detected) {
      return json(200, { ok: true, job_id: jobId, status: 'SKIPPED' });
    }

    // 4) Parse with Anthropic — graceful degradation if env missing.
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    const model = Deno.env.get('ANTHROPIC_MODEL') ?? DEFAULT_MODEL;

    if (!apiKey) {
      await sb
        .from('aggregator_email_jobs')
        .update({
          status: 'PARSED',
          error_text:
            'Cheia Anthropic lipseste — emailul a fost primit dar nu a putut fi parsat automat. Verificati manual din inbox.',
        })
        .eq('id', jobId);
      setMetadata({ degraded: 'anthropic_env_missing' });
      return json(200, { ok: true, job_id: jobId, status: 'PARSED', degraded: true });
    }

    await sb.from('aggregator_email_jobs').update({ status: 'PARSING' }).eq('id', jobId);

    let parsed: ParsedOrder;
    let cost_usd = 0;
    try {
      const r = await callAnthropicParser(apiKey, model, detected, bodyText);
      parsed = r.parsed;
      cost_usd = r.cost_usd;
    } catch (e) {
      const msg = (e as Error).message;
      const isCredit = /credit|insufficient|billing|quota/i.test(msg);
      await sb
        .from('aggregator_email_jobs')
        .update({
          status: 'FAILED',
          error_text: isCredit
            ? 'Credit Anthropic epuizat — verificati emailul manual din inbox si reincercati cand creditul este realimentat.'
            : `Eroare la parsare: ${msg.slice(0, 400)}`,
        })
        .eq('id', jobId);
      setMetadata({ parse_error: msg.slice(0, 200) });
      return json(200, { ok: true, job_id: jobId, status: 'FAILED', degraded: true });
    }

    setMetadata({ cost_usd, items: parsed.items?.length ?? 0 });

    // 5) Persist parsed_data + decide auto-apply.
    if (highConfidence(parsed)) {
      // Codex P1 follow-up: dedup must be ATOMIC + use a conflict target
      // that matches the partial unique index. supabase-js upsert can't
      // emit `ON CONFLICT (...) WHERE ...`, so we delegate to the
      // public.apply_aggregator_order RPC (migration 20260606_009) which
      // does the INSERT ... ON CONFLICT ... WHERE source IN (...) AND
      // hir_delivery_id IS NOT NULL DO NOTHING + deterministic lookup
      // in a single SQL function. service_role only.
      const externalId = parsed.external_order_id ?? null;

      // Codex P2 item shape: existing order detail + KDS readers compute
      // line totals via `price_ron ?? unit_price ?? price` and quantity
      // via `qty ?? quantity`. Write BOTH the canonical aggregator field
      // (unit_price_ron) and the legacy fields so admin/orders/[id] +
      // kds/print/[id] render line totals correctly.
      const itemsJson = parsed.items.map((it) => ({
        name: it.name,
        quantity: it.quantity,
        qty: it.quantity,
        unit_price_ron: it.unit_price_ron,
        price_ron: it.unit_price_ron,
        modifiers: it.modifiers ?? null,
      }));

      const notes = [
        externalId ? `${detected} #${externalId}` : null,
        parsed.customer_name,
        parsed.customer_phone,
        parsed.delivery_address,
        parsed.notes,
      ]
        .filter(Boolean)
        .join(' • ')
        .slice(0, 1000);

      let appliedOrderId: string | null = null;
      let deduped = false;

      if (externalId) {
        // Atomic via RPC. Returns table (order_id uuid, deduped boolean).
        const { data: rpcRows, error: rpcErr } = await sb.rpc('apply_aggregator_order', {
          p_tenant_id: tenantId,
          p_source: detected,
          p_external_order_id: externalId,
          p_items: itemsJson,
          p_subtotal_ron: parsed.subtotal_ron,
          p_delivery_fee_ron: parsed.delivery_fee_ron ?? 0,
          p_total_ron: parsed.total_ron,
          p_notes: notes,
        });
        if (rpcErr) {
          await sb
            .from('aggregator_email_jobs')
            .update({
              status: 'PARSED',
              parsed_data: parsed as unknown as Record<string, unknown>,
              error_text: `Auto-aplicare esuata: ${rpcErr.message}. Aplicati manual.`,
            })
            .eq('id', jobId);
          setMetadata({ apply_error: rpcErr.message.slice(0, 200) });
          return json(200, { ok: true, job_id: jobId, status: 'PARSED', auto_apply: false });
        }
        const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
        appliedOrderId = (row as { order_id: string | null } | null)?.order_id ?? null;
        deduped = (row as { deduped: boolean } | null)?.deduped ?? false;
      } else {
        // No external_order_id parsed → no dedup key. Plain insert.
        const orderRow = {
          tenant_id: tenantId,
          items: itemsJson,
          subtotal_ron: parsed.subtotal_ron,
          delivery_fee_ron: parsed.delivery_fee_ron ?? 0,
          total_ron: parsed.total_ron,
          status: 'CONFIRMED',
          payment_status: 'PAID',
          source: detected,
          hir_delivery_id: null,
          notes,
        };
        const { data: inserted, error: insErr } = await sb
          .from('restaurant_orders')
          .insert(orderRow)
          .select('id')
          .single();
        if (insErr || !inserted) {
          await sb
            .from('aggregator_email_jobs')
            .update({
              status: 'PARSED',
              parsed_data: parsed as unknown as Record<string, unknown>,
              error_text: `Auto-aplicare esuata: ${insErr?.message ?? 'unknown'}. Aplicati manual.`,
            })
            .eq('id', jobId);
          setMetadata({ apply_error: insErr?.message?.slice(0, 200) });
          return json(200, { ok: true, job_id: jobId, status: 'PARSED', auto_apply: false });
        }
        appliedOrderId = (inserted as { id: string }).id;
      }

      if (!appliedOrderId) {
        // Should not happen — defensive.
        await sb
          .from('aggregator_email_jobs')
          .update({
            status: 'PARSED',
            parsed_data: parsed as unknown as Record<string, unknown>,
            error_text:
              'Auto-aplicare esuata: nu s-a putut determina id-ul comenzii. Aplicati manual.',
          })
          .eq('id', jobId);
        return json(200, { ok: true, job_id: jobId, status: 'PARSED', auto_apply: false });
      }

      await sb
        .from('aggregator_email_jobs')
        .update({
          status: 'APPLIED',
          parsed_data: parsed as unknown as Record<string, unknown>,
          applied_order_id: appliedOrderId,
          error_text: deduped
            ? `Duplicat — comanda ${detected} #${externalId} a fost deja aplicată anterior.`
            : null,
        })
        .eq('id', jobId);
      setMetadata({ applied_order_id: appliedOrderId, deduped });
      return json(200, {
        ok: true,
        job_id: jobId,
        status: 'APPLIED',
        order_id: appliedOrderId,
        source: detected,
        deduped,
      });
    }

    // Low confidence — keep PARSED, owner reviews and applies manually.
    await sb
      .from('aggregator_email_jobs')
      .update({
        status: 'PARSED',
        parsed_data: parsed as unknown as Record<string, unknown>,
        error_text: 'Confidenta scazuta — verificati datele si aplicati manual.',
      })
      .eq('id', jobId);
    return json(200, { ok: true, job_id: jobId, status: 'PARSED', auto_apply: false });
  });
});
