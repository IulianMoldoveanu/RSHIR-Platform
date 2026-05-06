// HIR — Partner Commission Calculator (monthly)
//
// For each ACTIVE partner_referral, sums the HIR fees collected on the
// referred tenant's DELIVERED + PAID orders for a given calendar month
// (Bucharest local boundaries) and upserts a row into
// `partner_commissions`.
//
// Schedule: pg_cron at 03:00 Europe/Bucharest on the 2nd of each month
// (= 01:00 UTC, since DST drift is irrelevant — both winter UTC+2 and
// summer UTC+3 land between 02:00 and 03:00 RO local on day 2). See
// `supabase/migrations/20260601_001_partner_commission_cron.sql`.
//
// Auth: shared-secret header `x-hir-notify-secret`, mirroring every
// other HIR notify-style function. HMAC env: HIR_NOTIFY_SECRET.
//
// Required env (Supabase function secrets):
//   HIR_NOTIFY_SECRET
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//
// Query params:
//   ?period=YYYY-MM  — backfill a specific month (default: previous month)
//   ?dry_run=true    — compute everything, skip the upsert, return summary
//
// Idempotent: upserts on (referral_id, period_start, period_end). Rows
// already in status=PAID are NEVER overwritten — they're skipped with a
// log warning instead.
//
// Pricing assumption: HIR fee = 3.00 RON per delivered+paid order
// (Tier 1 in the pricing memory).
//
// DEFERRED — Tier 2 (per-order aggregator margin) cannot be implemented
// until both (a) HIR signs the first aggregator/marketplace contract and
// (b) `restaurant_orders` exposes a per-row `hir_fee_ron numeric` column
// (or equivalent settlement table). When both land, sum the per-row fee
// instead of `orderCount * HIR_FEE_PER_ORDER_RON`. Tracking note in
// HIR-Status-Reports/RSHIR/2026-05-06-GAP-AUDIT.md §2.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
// Lane 9 observability — additive wrap, never changes behavior.
import { withRunLog } from '../_shared/log.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

// HIR fee per delivered+paid order (RON, Tier 1).
const HIR_FEE_PER_ORDER_RON = 3.0;
const PAGE_SIZE = 1000;

// ────────────────────────────────────────────────────────────
// Period helpers — Bucharest local month boundaries
// ────────────────────────────────────────────────────────────

// Bucharest is UTC+2 (winter) or UTC+3 (summer DST). For month
// boundaries we approximate by computing the offset for the 1st of the
// target month using Intl.DateTimeFormat. This is close enough for
// monthly aggregation: an order placed on the DST switch hour is
// counted in the obvious month.
function bucharestOffsetHoursFor(date: Date): number {
  // Find the offset by formatting the date in Bucharest and comparing
  // to UTC. Returns +2 or +3.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'));
  const utc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
  );
  return Math.round((local - utc) / 3600000);
}

type Period = {
  // Bucharest-local YYYY-MM-01 (date column).
  periodStartDate: string;
  // Bucharest-local last-day-of-month YYYY-MM-DD.
  periodEndDate: string;
  // ISO timestamps for filtering restaurant_orders.created_at (which is
  // stored as timestamptz in UTC). `startUtc` = midnight RO local of
  // first-of-month, `endUtc` = midnight RO local of first-of-next-month.
  startUtc: string;
  endUtc: string;
  label: string; // 'YYYY-MM'
};

function previousMonthBucharest(now: Date): { year: number; month: number } {
  // What's the calendar month *in Bucharest* right now?
  const offset = bucharestOffsetHoursFor(now);
  const local = new Date(now.getTime() + offset * 3600000);
  let y = local.getUTCFullYear();
  let m = local.getUTCMonth(); // 0-11; this is RO-local month
  // Previous month
  m -= 1;
  if (m < 0) {
    m = 11;
    y -= 1;
  }
  return { year: y, month: m };
}

function buildPeriod(year: number, month0: number): Period {
  // First of month 00:00 Bucharest
  const firstLocal = new Date(Date.UTC(year, month0, 1, 0, 0, 0));
  const firstOffset = bucharestOffsetHoursFor(firstLocal);
  const startUtc = new Date(firstLocal.getTime() - firstOffset * 3600000);

  // First of next month 00:00 Bucharest
  let nextY = year;
  let nextM = month0 + 1;
  if (nextM > 11) {
    nextM = 0;
    nextY += 1;
  }
  const nextLocal = new Date(Date.UTC(nextY, nextM, 1, 0, 0, 0));
  const nextOffset = bucharestOffsetHoursFor(nextLocal);
  const endUtc = new Date(nextLocal.getTime() - nextOffset * 3600000);

  // Last day of month (RO local)
  const lastDayLocal = new Date(Date.UTC(nextY, nextM, 0));
  const dd = String(lastDayLocal.getUTCDate()).padStart(2, '0');
  const mm = String(month0 + 1).padStart(2, '0');
  const periodStartDate = `${year}-${mm}-01`;
  const periodEndDate = `${year}-${mm}-${dd}`;

  return {
    periodStartDate,
    periodEndDate,
    startUtc: startUtc.toISOString(),
    endUtc: endUtc.toISOString(),
    label: `${year}-${mm}`,
  };
}

function parsePeriodParam(s: string): { year: number; month0: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month1 = Number(m[2]);
  if (month1 < 1 || month1 > 12) return null;
  return { year, month0: month1 - 1 };
}

// Round half-up to integer cents from RON (numeric).
function ronToCents(ron: number): number {
  return Math.round(ron * 100 + Number.EPSILON);
}

// ────────────────────────────────────────────────────────────
// Data layer
// ────────────────────────────────────────────────────────────

type Referral = {
  id: string;
  partner_id: string;
  tenant_id: string;
  commission_pct: number | null;
  ended_at: string | null;
  partner_default_pct: number;
};

async function fetchActiveReferrals(
  supabase: SupabaseClient,
): Promise<Referral[]> {
  // Pull every referral whose partner is ACTIVE. The end-date filter
  // (`ended_at` before period start) is applied per-referral inside the
  // main loop — we still want to compute commission for the partial
  // month *during* which a referral churned.
  const { data, error } = await supabase
    .from('partner_referrals')
    .select(
      'id, partner_id, tenant_id, commission_pct, ended_at, partners!inner(status, default_commission_pct)',
    )
    .eq('partners.status', 'ACTIVE');
  if (error) {
    console.error('[partner-commission-calc] referral lookup error:', error.message);
    return [];
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return rows.map((row) => {
    const partner = (row.partners ?? {}) as Record<string, unknown>;
    return {
      id: row.id as string,
      partner_id: row.partner_id as string,
      tenant_id: row.tenant_id as string,
      commission_pct: row.commission_pct as number | null,
      ended_at: row.ended_at as string | null,
      partner_default_pct: Number(partner.default_commission_pct ?? 0),
    };
  });
}

async function countOrdersInPeriod(
  supabase: SupabaseClient,
  tenantId: string,
  startUtc: string,
  endUtc: string,
): Promise<number> {
  let total = 0;
  let from = 0;
  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('restaurant_orders')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'DELIVERED')
      .eq('payment_status', 'PAID')
      .gte('created_at', startUtc)
      .lt('created_at', endUtc)
      .range(from, to);
    if (error) {
      console.error('[partner-commission-calc] order count error:', error.message);
      throw error;
    }
    const rows = data ?? [];
    total += rows.length;
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return total;
}

type ExistingCommission = {
  id: string;
  status: string;
};

async function getExistingCommission(
  supabase: SupabaseClient,
  referralId: string,
  periodStart: string,
  periodEnd: string,
): Promise<ExistingCommission | null> {
  const { data, error } = await supabase
    .from('partner_commissions')
    .select('id, status')
    .eq('referral_id', referralId)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .maybeSingle();
  if (error) {
    console.error('[partner-commission-calc] existing lookup error:', error.message);
    return null;
  }
  return (data as ExistingCommission | null) ?? null;
}

async function upsertCommission(
  supabase: SupabaseClient,
  row: {
    partner_id: string;
    referral_id: string;
    period_start: string;
    period_end: string;
    amount_cents: number;
    order_count: number;
  },
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('partner_commissions')
    .upsert(
      {
        partner_id: row.partner_id,
        referral_id: row.referral_id,
        period_start: row.period_start,
        period_end: row.period_end,
        amount_cents: row.amount_cents,
        order_count: row.order_count,
        status: 'PENDING',
      },
      { onConflict: 'referral_id,period_start,period_end' },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// HTTP entrypoint
// ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  return withRunLog('partner-commission-calc', async ({ setMetadata }) => {
  const expected = Deno.env.get('HIR_NOTIFY_SECRET');
  if (!expected) return json(500, { error: 'secret_not_configured' });
  const got = req.headers.get('x-hir-notify-secret') ?? '';
  if (got.length !== expected.length) return json(401, { error: 'unauthorized' });
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  if (diff !== 0) return json(401, { error: 'unauthorized' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'supabase_env_missing' });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const url = new URL(req.url);
  const periodParam = url.searchParams.get('period');
  const dryRun = url.searchParams.get('dry_run') === 'true';

  let year: number;
  let month0: number;
  if (periodParam) {
    const parsed = parsePeriodParam(periodParam);
    if (!parsed) return json(400, { error: 'invalid_period_format', expected: 'YYYY-MM' });
    year = parsed.year;
    month0 = parsed.month0;
  } else {
    const prev = previousMonthBucharest(new Date());
    year = prev.year;
    month0 = prev.month;
  }

  const period = buildPeriod(year, month0);
  console.log(
    `[partner-commission-calc] period=${period.label} startUtc=${period.startUtc} endUtc=${period.endUtc} dry_run=${dryRun}`,
  );

  const referrals = await fetchActiveReferrals(supabase);
  console.log(`[partner-commission-calc] ${referrals.length} active referral(s)`);

  let referralsProcessed = 0;
  let commissionsInserted = 0;
  let commissionsSkippedPaid = 0;
  let commissionsFailed = 0;
  let totalAmountCents = 0;

  for (const r of referrals) {
    referralsProcessed += 1;

    // Cheap end-date guard: if ended_at is before the period START, skip.
    if (r.ended_at && new Date(r.ended_at).getTime() <= new Date(period.startUtc).getTime()) {
      continue;
    }

    try {
      const orderCount = await countOrdersInPeriod(
        supabase,
        r.tenant_id,
        period.startUtc,
        period.endUtc,
      );

      const sumHirFeesRon = orderCount * HIR_FEE_PER_ORDER_RON;
      const pct = r.commission_pct ?? r.partner_default_pct;
      const commissionRon = sumHirFeesRon * (pct / 100);
      const amountCents = ronToCents(commissionRon);

      // Skip an existing PAID row.
      const existing = await getExistingCommission(
        supabase,
        r.id,
        period.periodStartDate,
        period.periodEndDate,
      );
      if (existing && existing.status === 'PAID') {
        console.warn(
          `[partner-commission-calc] referral=${r.id} period=${period.label} already PAID — skipping`,
        );
        commissionsSkippedPaid += 1;
        continue;
      }

      totalAmountCents += amountCents;

      if (dryRun) {
        commissionsInserted += 1;
        continue;
      }

      const res = await upsertCommission(supabase, {
        partner_id: r.partner_id,
        referral_id: r.id,
        period_start: period.periodStartDate,
        period_end: period.periodEndDate,
        amount_cents: amountCents,
        order_count: orderCount,
      });
      if (res.ok) {
        commissionsInserted += 1;
      } else {
        commissionsFailed += 1;
        console.error(
          `[partner-commission-calc] upsert failed referral=${r.id}: ${res.error ?? 'unknown'}`,
        );
      }
    } catch (e) {
      commissionsFailed += 1;
      console.error(
        `[partner-commission-calc] referral error referral=${r.id}: ${(e as Error).message}`,
      );
    }
  }

  const summary = {
    ok: true,
    period: period.label,
    dry_run: dryRun,
    referrals_processed: referralsProcessed,
    commissions_inserted: commissionsInserted,
    commissions_skipped_paid: commissionsSkippedPaid,
    commissions_failed: commissionsFailed,
    total_amount_cents: totalAmountCents,
  };
  console.log('[partner-commission-calc] summary', summary);
  setMetadata(summary);
  return json(200, summary);
  });
});
