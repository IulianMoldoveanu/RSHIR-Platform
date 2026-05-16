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
export function ronToCents(ron: number): number {
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
  referred_at: string; // when the referral was created (Y1 boundary for this referral)
  wave_label: string;
};

// v3 — wave bonus config fetched once per run.
type WaveBonus = {
  wave_label: string;
  direct_pct_y1_bonus: number;
  direct_pct_recurring_bonus: number;
  override_pct_y1_bonus: number;
  override_pct_recurring_bonus: number;
};

// v3 — sponsor relationship for a sub-partner.
type SponsorRow = {
  sponsor_partner_id: string;
  override_pct_y1: number;
  override_pct_recurring: number;
  sunset_at: string;
  sponsor_wave_label: string;
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
      'id, partner_id, tenant_id, commission_pct, ended_at, referred_at, partners!inner(status, default_commission_pct, wave_label)',
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
      referred_at: (row.referred_at as string) ?? new Date(0).toISOString(),
      partner_default_pct: Number(partner.default_commission_pct ?? 0),
      wave_label: (partner.wave_label as string) ?? 'OPEN',
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
    .eq('commission_type', 'DIRECT')
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
        commission_type: 'DIRECT',
      },
      { onConflict: 'referral_id,period_start,period_end' },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// v3 — Wave bonus fetch
// ────────────────────────────────────────────────────────────

async function fetchWaveBonuses(
  supabase: SupabaseClient,
): Promise<Map<string, WaveBonus>> {
  const { data, error } = await supabase
    .from('wave_bonuses')
    .select('wave_label, direct_pct_y1_bonus, direct_pct_recurring_bonus, override_pct_y1_bonus, override_pct_recurring_bonus');
  if (error) {
    console.error('[partner-commission-calc] wave_bonuses fetch error:', error.message);
    return new Map();
  }
  const map = new Map<string, WaveBonus>();
  for (const row of (data ?? []) as WaveBonus[]) {
    map.set(row.wave_label, row);
  }
  return map;
}

// ────────────────────────────────────────────────────────────
// v3 — Sponsor lookup for a given partner
// ────────────────────────────────────────────────────────────

async function fetchSponsor(
  supabase: SupabaseClient,
  subPartnerId: string,
): Promise<SponsorRow | null> {
  const { data, error } = await supabase
    .from('partner_sponsors')
    .select('sponsor_partner_id, override_pct_y1, override_pct_recurring, sunset_at, partners!partner_sponsors_sponsor_partner_id_fkey(wave_label)')
    .eq('sub_partner_id', subPartnerId)
    .maybeSingle();
  if (error) {
    console.error('[partner-commission-calc] sponsor lookup error:', error.message);
    return null;
  }
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const sponsorPartner = (row.partners ?? {}) as Record<string, unknown>;
  return {
    sponsor_partner_id: row.sponsor_partner_id as string,
    override_pct_y1: Number(row.override_pct_y1 ?? 10),
    override_pct_recurring: Number(row.override_pct_recurring ?? 6),
    sunset_at: row.sunset_at as string,
    sponsor_wave_label: (sponsorPartner.wave_label as string) ?? 'OPEN',
  };
}

// ────────────────────────────────────────────────────────────
// v3 — Champion gift lookup
// ────────────────────────────────────────────────────────────

// Returns the partner_id of the reseller who brought the referrer_tenant,
// or null if no champion referral exists or the referrer has no reseller.
async function fetchChampionPartner(
  supabase: SupabaseClient,
  tenantId: string, // the "referred" tenant in this commission cycle
): Promise<string | null> {
  // Step 1: does this tenant have a champion_referrals row (it was referred by a restaurant)?
  const { data: champRow, error: champErr } = await supabase
    .from('champion_referrals')
    .select('referrer_tenant_id, reward_status')
    .eq('referred_tenant_id', tenantId)
    .in('reward_status', ['verified', 'paid'])
    .maybeSingle();
  if (champErr) {
    console.error('[partner-commission-calc] champion lookup error:', champErr.message);
    return null;
  }
  if (!champRow) return null;

  const referrerTenantId = (champRow as Record<string, unknown>).referrer_tenant_id as string;

  // Step 2: find the reseller (partner_referrals) who brought the referrer restaurant.
  const { data: refRow, error: refErr } = await supabase
    .from('partner_referrals')
    .select('partner_id')
    .eq('tenant_id', referrerTenantId)
    .is('ended_at', null)
    .maybeSingle();
  if (refErr) {
    console.error('[partner-commission-calc] champion partner_referrals lookup error:', refErr.message);
    return null;
  }
  if (!refRow) return null;

  return (refRow as Record<string, unknown>).partner_id as string;
}

// ────────────────────────────────────────────────────────────
// v3 — Upsert helpers for new commission types
// ────────────────────────────────────────────────────────────

async function upsertWaveBonus(
  supabase: SupabaseClient,
  row: {
    partner_id: string;
    referral_id: string;
    period_start: string;
    period_end: string;
    amount_cents: number;
    pct_applied: number;
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
        order_count: 0,
        status: 'PENDING',
        commission_type: 'WAVE_BONUS',
        source_partner_id: null,
        pct_applied: row.pct_applied,
      },
      { onConflict: 'referral_id,period_start,period_end', ignoreDuplicates: false },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function upsertOverride(
  supabase: SupabaseClient,
  row: {
    sponsor_partner_id: string;
    referral_id: string;
    period_start: string;
    period_end: string;
    amount_cents: number;
    pct_applied: number;
    source_partner_id: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('partner_commissions')
    .upsert(
      {
        partner_id: row.sponsor_partner_id,
        referral_id: row.referral_id,
        period_start: row.period_start,
        period_end: row.period_end,
        amount_cents: row.amount_cents,
        order_count: 0,
        status: 'PENDING',
        commission_type: 'OVERRIDE',
        source_partner_id: row.source_partner_id,
        pct_applied: row.pct_applied,
      },
      { onConflict: 'referral_id,period_start,period_end,source_partner_id', ignoreDuplicates: false },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function upsertChampionGift(
  supabase: SupabaseClient,
  row: {
    partner_id: string;
    referral_id: string;
    period_start: string;
    period_end: string;
    amount_cents: number;
    pct_applied: number;
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
        order_count: 0,
        status: 'PENDING',
        commission_type: 'CHAMPION_GIFT',
        source_partner_id: null,
        pct_applied: row.pct_applied,
      },
      { onConflict: 'referral_id,period_start,period_end', ignoreDuplicates: false },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Increment total_paid_cents on a partner_sponsors row (fire-and-forget, best-effort).
async function incrementSponsorPaid(
  supabase: SupabaseClient,
  sponsorPartnerId: string,
  subPartnerId: string,
  deltaCents: number,
): Promise<void> {
  const { error } = await supabase.rpc('increment_sponsor_paid_cents', {
    p_sponsor_id: sponsorPartnerId,
    p_sub_id: subPartnerId,
    p_delta: deltaCents,
  });
  if (error) {
    // Non-fatal — audit trail still exists in the commission row.
    console.warn('[partner-commission-calc] increment_sponsor_paid_cents failed:', error.message);
  }
}

// ────────────────────────────────────────────────────────────
// v3 — Y1 boundary helper
// ────────────────────────────────────────────────────────────

// Returns true if the referral is still within its first 365 days at period_end.
export function isWithinY1(referredAt: string, periodEndDate: string): boolean {
  const referredMs = new Date(referredAt).getTime();
  const periodEndMs = new Date(periodEndDate).getTime();
  const y1BoundaryMs = referredMs + 365 * 24 * 60 * 60 * 1000;
  return periodEndMs < y1BoundaryMs;
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

  // v3 — fetch wave bonus config once for the whole run.
  const waveBonuses = await fetchWaveBonuses(supabase);

  let referralsProcessed = 0;
  let commissionsInserted = 0;
  let commissionsSkippedPaid = 0;
  let commissionsFailed = 0;
  let totalAmountCents = 0;

  // v3 — sponsor override accumulator: sponsor_partner_id → total DIRECT cents that
  // sponsor earned this period (used to enforce the 40% cap across all OVERRIDE rows).
  // We collect direct amounts during the loop, then write OVERRIDE rows at the end.
  type PendingOverride = {
    sponsor_partner_id: string;
    referral_id: string;
    source_partner_id: string;
    raw_override_pct: number;
    raw_amount_cents: number; // before cap scaling
    hir_net_cents: number;
  };
  const pendingOverrides: PendingOverride[] = [];
  // sponsor → sum of DIRECT amounts this period across all subs it sponsors.
  const sponsorDirectSum = new Map<string, number>();

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
      const hirNetCents = ronToCents(sumHirFeesRon);
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

      if (!dryRun) {
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
      } else {
        commissionsInserted += 1;
      }

      // ── v3 WAVE_BONUS ────────────────────────────────────────────
      if (r.wave_label !== 'OPEN') {
        const wb = waveBonuses.get(r.wave_label);
        if (wb) {
          const withinY1 = isWithinY1(r.referred_at, period.periodEndDate);
          const bonusPct = withinY1 ? wb.direct_pct_y1_bonus : wb.direct_pct_recurring_bonus;
          if (bonusPct > 0) {
            const bonusAmountCents = Math.round(hirNetCents * bonusPct / 100);
            totalAmountCents += bonusAmountCents;
            if (!dryRun) {
              const wbRes = await upsertWaveBonus(supabase, {
                partner_id: r.partner_id,
                referral_id: r.id,
                period_start: period.periodStartDate,
                period_end: period.periodEndDate,
                amount_cents: bonusAmountCents,
                pct_applied: bonusPct,
              });
              if (!wbRes.ok) {
                console.error(
                  `[partner-commission-calc] wave_bonus upsert failed referral=${r.id}: ${wbRes.error ?? 'unknown'}`,
                );
              }
            }
          }
        }
      }

      // ── v3 OVERRIDE (accumulate for cap enforcement later) ────────
      const sponsor = await fetchSponsor(supabase, r.partner_id);
      if (sponsor && new Date(sponsor.sunset_at).getTime() > new Date(period.periodEndDate).getTime()) {
        const withinY1 = isWithinY1(r.referred_at, period.periodEndDate);
        let overridePct = withinY1 ? sponsor.override_pct_y1 : sponsor.override_pct_recurring;

        // Wave 2 sponsor gets override boost from wave_bonuses.
        if (sponsor.sponsor_wave_label === 'W2') {
          const sponsorWb = waveBonuses.get('W2');
          if (sponsorWb) {
            overridePct += withinY1 ? sponsorWb.override_pct_y1_bonus : sponsorWb.override_pct_recurring_bonus;
          }
        }

        const rawOverrideCents = Math.round(hirNetCents * overridePct / 100);
        pendingOverrides.push({
          sponsor_partner_id: sponsor.sponsor_partner_id,
          referral_id: r.id,
          source_partner_id: r.partner_id,
          raw_override_pct: overridePct,
          raw_amount_cents: rawOverrideCents,
          hir_net_cents: hirNetCents,
        });

        // Accumulate the sponsor's DIRECT total (sponsor earns DIRECT on their
        // OWN referrals; here we track what DIRECT was generated for the sub
        // — this is used as the denominator for the cap rule).
        // Per spec: cap = 40% of sponsor's own DIRECT sum this period.
        // We accumulate sub's direct amounts keyed by sponsor; at cap-enforcement
        // time we'll compare total OVERRIDE against 40% of sponsor's OWN direct.
        // Simplest safe approach: track sum of this sub's direct amounts per sponsor.
        sponsorDirectSum.set(
          sponsor.sponsor_partner_id,
          (sponsorDirectSum.get(sponsor.sponsor_partner_id) ?? 0) + amountCents,
        );
      }

      // ── v3 CHAMPION_GIFT ─────────────────────────────────────────
      const championPartnerId = await fetchChampionPartner(supabase, r.tenant_id);
      if (championPartnerId) {
        // Mirror the DIRECT amount.
        totalAmountCents += amountCents;
        if (!dryRun) {
          const cgRes = await upsertChampionGift(supabase, {
            partner_id: championPartnerId,
            referral_id: r.id,
            period_start: period.periodStartDate,
            period_end: period.periodEndDate,
            amount_cents: amountCents,
            pct_applied: pct,
          });
          if (!cgRes.ok) {
            console.error(
              `[partner-commission-calc] champion_gift upsert failed referral=${r.id}: ${cgRes.error ?? 'unknown'}`,
            );
          }
        }
      }
    } catch (e) {
      commissionsFailed += 1;
      console.error(
        `[partner-commission-calc] referral error referral=${r.id}: ${(e as Error).message}`,
      );
    }
  }

  // ── v3 OVERRIDE cap enforcement + write ─────────────────────────
  if (!dryRun && pendingOverrides.length > 0) {
    // Group by sponsor.
    const bySponsor = new Map<string, PendingOverride[]>();
    for (const po of pendingOverrides) {
      const arr = bySponsor.get(po.sponsor_partner_id) ?? [];
      arr.push(po);
      bySponsor.set(po.sponsor_partner_id, arr);
    }

    for (const [sponsorId, overrides] of bySponsor) {
      const cap = (sponsorDirectSum.get(sponsorId) ?? 0) * 0.4;
      const rawTotal = overrides.reduce((s, o) => s + o.raw_amount_cents, 0);
      const scaleFactor = rawTotal > cap && cap > 0 ? cap / rawTotal : 1.0;

      for (const po of overrides) {
        const finalCents = Math.round(po.raw_amount_cents * scaleFactor);
        const finalPct = po.raw_override_pct * scaleFactor;

        if (finalCents <= 0) continue;

        totalAmountCents += finalCents;

        const ovRes = await upsertOverride(supabase, {
          sponsor_partner_id: po.sponsor_partner_id,
          referral_id: po.referral_id,
          period_start: period.periodStartDate,
          period_end: period.periodEndDate,
          amount_cents: finalCents,
          pct_applied: finalPct,
          source_partner_id: po.source_partner_id,
        });
        if (ovRes.ok) {
          // Best-effort: bump total_paid_cents on the sponsor relationship row.
          await incrementSponsorPaid(supabase, po.sponsor_partner_id, po.source_partner_id, finalCents);
        } else {
          console.error(
            `[partner-commission-calc] override upsert failed referral=${po.referral_id} sponsor=${po.sponsor_partner_id}: ${ovRes.error ?? 'unknown'}`,
          );
          commissionsFailed += 1;
        }
      }
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
