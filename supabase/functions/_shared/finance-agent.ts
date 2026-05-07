// Finance Agent — Deno-side canonical runtime (Sprint 16).
//
// Registered with the Master Orchestrator (PR #341) as the Finance
// sub-agent. Three READ-ONLY intents per the lane brief:
//
//   finance.cash_flow_30d             ← Telegram /finance_flux
//   finance.tax_summary_month         ← Telegram /finance_tva
//   finance.predict_payouts_next_week ← Telegram /finance_plati
//
// All three are READ-ONLY from the dispatcher's perspective:
//   - No writes to payment tables / payouts / fiscal records.
//   - No PSP integration touched.
//   - Output is SUGGESTIONS / REPORTS — never pushed to ANAF, never
//     auto-billed.
//
// Architecture:
//   1. Deterministic SQL aggregation over existing tables
//      (restaurant_orders, psp_payments, courier_orders).
//   2. Optional Anthropic Sonnet 4.5 call to narrate the numbers in RO
//      formal copy (1-2 sentences, surfaced via `data.commentary`).
//   3. Daily-cap check via copilot_agent_runs (5 / tenant / 24h).
//
// Why aggregation in code (not a SQL VIEW): a VIEW would either need
// SECURITY DEFINER + RLS rewrite (risky) or new RLS policies (schema
// drift). The aggregator runs under service-role through the Edge
// Function — same pattern as growth-agent-daily — and the tenant scope
// is enforced by the `tenant_id = $1` filter on every query. Lane brief:
// "NO new tables. NO migrations unless purely a SQL VIEW that aggregates
// existing data, AND Codex won't flag drift" — aggregation in code wins.
//
// Cost: input ~600 tok, output ~150 tok at Sonnet 4.5
// = $0.0018 + $0.00225 ≈ $0.004 per invocation. Daily cap of 5 = max
// $0.02 / tenant / day, well under the $0.025 / invocation target.

// Note on import path: Deno would normally require a `.ts` extension here.
// We omit it so the Node-side typecheck (tsc on the admin app) passes
// without enabling allowImportingTsExtensions cluster-wide. The Deno
// Edge Function bundler (esbuild) resolves this fine because we ship the
// build via `scripts/deploy-fn-with-shared.mjs` which inlines _shared
// dependencies. Same precedent as `master-orchestrator.test.ts`.
import {
  registerIntent,
  type HandlerContext,
  type HandlerPlan,
  type HandlerResult,
  type IntentHandler,
} from './master-orchestrator';

// ---------------------------------------------------------------------------
// Constants — kept in sync with apps/restaurant-admin/src/lib/ai/agents/finance-agent.ts
// (the Node-side type mirror). Drift caught by finance-agent.test.ts.
// ---------------------------------------------------------------------------

export const FINANCE_AGENT_MODEL = 'claude-sonnet-4-5-20250929';
export const DAILY_INVOCATION_CAP = 5;
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Anthropic pricing for Sonnet 4.5 (2026-05-08).
const INPUT_COST_PER_TOKEN_USD = 3.0 / 1_000_000;
const OUTPUT_COST_PER_TOKEN_USD = 15.0 / 1_000_000;

// Default RO HoReCa VAT rate post-2025-08-01 (Legea 141/2025). Same default
// as apps/restaurant-admin/src/lib/fiscal.ts.
const DEFAULT_VAT_RATE_PCT = 11;

// ---------------------------------------------------------------------------
// Test injection — vitest stub fetch hook + Anthropic skip flag.
// ---------------------------------------------------------------------------

let fetchOverride: typeof fetch | null = null;
export function setFetchForTesting(f: typeof fetch | null): void {
  fetchOverride = f;
}

// When true, skip the Anthropic narration call entirely (used by tests
// that don't care about the commentary string and don't want to stub
// Anthropic). Production sets to false.
let skipAnthropicForTesting = false;
export function setSkipAnthropicForTesting(skip: boolean): void {
  skipAnthropicForTesting = skip;
}

// ---------------------------------------------------------------------------
// Anthropic call (raw fetch, Deno-friendly)
// ---------------------------------------------------------------------------

type AnthropicResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
): Promise<AnthropicResult> {
  const fn = fetchOverride ?? fetch;
  const res = await fn(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: FINANCE_AGENT_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`anthropic_${res.status}: ${errText.slice(0, 300)}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  const text: string =
    Array.isArray(data?.content) && data.content[0]?.type === 'text' ? data.content[0].text : '';
  return {
    text: text || '',
    inputTokens: Number(data?.usage?.input_tokens ?? 0),
    outputTokens: Number(data?.usage?.output_tokens ?? 0),
  };
}

function costUsdOf(input: number, output: number): number {
  return input * INPUT_COST_PER_TOKEN_USD + output * OUTPUT_COST_PER_TOKEN_USD;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getApiKey(): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const key = (globalThis as any).Deno?.env?.get?.('ANTHROPIC_API_KEY') ?? '';
  if (!key) throw new Error('anthropic_missing_api_key');
  return key;
}

// ---------------------------------------------------------------------------
// Daily cap helper — counts EXECUTED finance-agent rows in copilot_agent_runs
// over the trailing 24h window. Excludes PROPOSED/REJECTED/REVERTED so a
// rejected attempt does not eat a slot.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkDailyCap(supabase: any, tenantId: string): Promise<{ count: number; capped: boolean }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('copilot_agent_runs')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', tenantId)
    .eq('agent_name', 'finance')
    .eq('state', 'EXECUTED')
    .gte('created_at', since);
  if (error) {
    console.warn('[finance-agent] checkDailyCap failed:', error.message);
    return { count: 0, capped: false };
  }
  const n = typeof count === 'number' ? count : 0;
  return { count: n, capped: n >= DAILY_INVOCATION_CAP };
}

// ---------------------------------------------------------------------------
// Bucharest local-day helpers
// ---------------------------------------------------------------------------

const RO_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  // en-CA gives us YYYY-MM-DD format directly.
  timeZone: 'Europe/Bucharest',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function bucharestDateKey(iso: string): string {
  return RO_DATE_FMT.format(new Date(iso));
}

function bucharestOffsetMinutes(at: Date): number {
  const utc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }));
  const buc = new Date(at.toLocaleString('en-US', { timeZone: 'Europe/Bucharest' }));
  return (buc.getTime() - utc.getTime()) / 60_000;
}

// Month bounds in UTC ISO, Bucharest-local-anchored. Independent start/end
// offsets handle the DST transitions inside March + October correctly
// (same fix as the sales-register export — Codex P2 on PR #286).
function monthBoundsUtc(year: number, monthIdxZeroBased: number): { startIso: string; endIso: string } {
  const localStart = new Date(Date.UTC(year, monthIdxZeroBased, 1, 0, 0, 0));
  const localEnd = new Date(Date.UTC(year, monthIdxZeroBased + 1, 1, 0, 0, 0));
  const startOffsetMin = bucharestOffsetMinutes(localStart);
  const endOffsetMin = bucharestOffsetMinutes(localEnd);
  return {
    startIso: new Date(localStart.getTime() - startOffsetMin * 60_000).toISOString(),
    endIso: new Date(localEnd.getTime() - endOffsetMin * 60_000).toISOString(),
  };
}

// Read VAT rate from tenants.settings.fiscal.vat_rate_pct, with the same
// fallback as lib/fiscal.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readTenantVatRate(supabase: any, tenantId: string): Promise<number> {
  const { data, error } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .maybeSingle();
  if (error || !data) return DEFAULT_VAT_RATE_PCT;
  const settings = (data.settings ?? {}) as Record<string, unknown>;
  const fiscal = (settings.fiscal ?? {}) as Record<string, unknown>;
  const v = fiscal.vat_rate_pct;
  if (typeof v !== 'number') return DEFAULT_VAT_RATE_PCT;
  // Allowed RO rates: 0/5/9/11/19/21. Reject anything else.
  if (![0, 5, 9, 11, 19, 21].includes(v)) return DEFAULT_VAT_RATE_PCT;
  return v;
}

// ---------------------------------------------------------------------------
// Anthropic narration — short RO commentary on top of deterministic numbers.
// Cost cap: ~$0.004/call. Skipped silently if Anthropic 5xx (we still
// return the numbers).
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_NARRATION = `Ești asistentul "Hepy" pentru un restaurant din România. Primești date financiare deja agregate; sarcina ta e să le sintetizezi în 1-2 propoziții formale, în limba română, fără a inventa numere.

Reguli:
- Returnezi DOAR text simplu, fără markdown, fără ghilimele de cod, fără JSON.
- Maxim 240 de caractere. O singură idee centrală.
- Folosește exclusiv valorile primite. Nu adăuga estimări proprii.
- Ton: formal-cald, „dumneavoastră". Nu folosi MAJUSCULE complete.
- Dacă datele sunt prea slabe pentru o concluzie (ex: 0 comenzi), spune asta scurt.`;

async function tryNarrate(
  prompt: string,
): Promise<{ commentary: string; inputTokens: number; outputTokens: number; costUsd: number }> {
  if (skipAnthropicForTesting) {
    return { commentary: '', inputTokens: 0, outputTokens: 0, costUsd: 0 };
  }
  try {
    const apiKey = await getApiKey();
    const r = await callAnthropic(apiKey, SYSTEM_PROMPT_NARRATION, prompt, 200);
    return {
      commentary: r.text.trim().slice(0, 280),
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      costUsd: costUsdOf(r.inputTokens, r.outputTokens),
    };
  } catch (e) {
    console.warn('[finance-agent] narration skipped:', e instanceof Error ? e.message : String(e));
    return { commentary: '', inputTokens: 0, outputTokens: 0, costUsd: 0 };
  }
}

// ---------------------------------------------------------------------------
// Aggregation helpers — pure functions that work on rows fetched from the DB.
// Exported for test access (the test seeds rows + asserts shapes).
// ---------------------------------------------------------------------------

type OrderRow = {
  id: string;
  created_at: string;
  total_ron: number | string | null;
  subtotal_ron: number | string | null;
  delivery_fee_ron: number | string | null;
  payment_status: string | null;
};

type PspPaymentRow = {
  order_id: string | null;
  hir_fee_bani: number | null;
  status: string | null;
};

type CourierOrderRow = {
  id: string;
  source_tenant_id: string | null;
  delivery_fee_ron: number | string | null;
  status: string | null;
  assigned_courier_user_id: string | null;
  created_at: string;
};

function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function aggregateCashFlow(
  orders: OrderRow[],
  pspPayments: PspPaymentRow[],
  courierOrders: CourierOrderRow[],
  periodStartIso: string,
  periodEndIso: string,
): {
  daily: Array<{
    date: string;
    gross_revenue_ron: number;
    hir_fees_ron: number;
    net_to_restaurant_ron: number;
    courier_payouts_ron: number;
    order_count: number;
  }>;
  totals: {
    gross_revenue_ron: number;
    hir_fees_ron: number;
    net_to_restaurant_ron: number;
    courier_payouts_ron: number;
    order_count: number;
  };
} {
  // Index hir_fee by order_id from psp_payments (CAPTURED only).
  const hirFeeByOrder = new Map<string, number>();
  for (const p of pspPayments) {
    if (p.status !== 'CAPTURED') continue;
    if (!p.order_id) continue;
    const baniNum = typeof p.hir_fee_bani === 'number' ? p.hir_fee_bani : 0;
    const existing = hirFeeByOrder.get(p.order_id) ?? 0;
    hirFeeByOrder.set(p.order_id, existing + baniNum / 100);
  }

  // Day buckets keyed by Bucharest-local YYYY-MM-DD.
  const buckets = new Map<
    string,
    {
      gross_revenue_ron: number;
      hir_fees_ron: number;
      net_to_restaurant_ron: number;
      courier_payouts_ron: number;
      order_count: number;
    }
  >();

  function getBucket(key: string) {
    let b = buckets.get(key);
    if (!b) {
      b = {
        gross_revenue_ron: 0,
        hir_fees_ron: 0,
        net_to_restaurant_ron: 0,
        courier_payouts_ron: 0,
        order_count: 0,
      };
      buckets.set(key, b);
    }
    return b;
  }

  for (const o of orders) {
    if (o.payment_status !== 'PAID') continue;
    const key = bucharestDateKey(o.created_at);
    const b = getBucket(key);
    const total = num(o.total_ron);
    const hirFee = hirFeeByOrder.get(o.id) ?? 0;
    b.gross_revenue_ron += total;
    b.hir_fees_ron += hirFee;
    b.net_to_restaurant_ron += total - hirFee;
    b.order_count += 1;
  }

  for (const c of courierOrders) {
    if (c.status !== 'DELIVERED') continue;
    const key = bucharestDateKey(c.created_at);
    const b = getBucket(key);
    b.courier_payouts_ron += num(c.delivery_fee_ron);
  }

  const daily = Array.from(buckets.entries())
    .map(([date, v]) => ({
      date,
      gross_revenue_ron: round2(v.gross_revenue_ron),
      hir_fees_ron: round2(v.hir_fees_ron),
      net_to_restaurant_ron: round2(v.net_to_restaurant_ron),
      courier_payouts_ron: round2(v.courier_payouts_ron),
      order_count: v.order_count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totals = daily.reduce(
    (acc, d) => {
      acc.gross_revenue_ron += d.gross_revenue_ron;
      acc.hir_fees_ron += d.hir_fees_ron;
      acc.net_to_restaurant_ron += d.net_to_restaurant_ron;
      acc.courier_payouts_ron += d.courier_payouts_ron;
      acc.order_count += d.order_count;
      return acc;
    },
    {
      gross_revenue_ron: 0,
      hir_fees_ron: 0,
      net_to_restaurant_ron: 0,
      courier_payouts_ron: 0,
      order_count: 0,
    },
  );

  // Round totals — JS float drift would surface as 1234.5600000001 otherwise.
  totals.gross_revenue_ron = round2(totals.gross_revenue_ron);
  totals.hir_fees_ron = round2(totals.hir_fees_ron);
  totals.net_to_restaurant_ron = round2(totals.net_to_restaurant_ron);
  totals.courier_payouts_ron = round2(totals.courier_payouts_ron);

  // Suppress unused-arg lint by referencing periodStartIso / periodEndIso —
  // the caller still uses them in the report wrapper. Returning them here
  // would couple the aggregator to the report shape.
  void periodStartIso;
  void periodEndIso;

  return { daily, totals };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function aggregateTaxSummary(
  orders: OrderRow[],
  vatRatePct: number,
  periodStartIso: string,
  periodEndIso: string,
): {
  rows: Array<{
    vat_rate_pct: number;
    gross_ron: number;
    net_ron: number;
    vat_due_ron: number;
    order_count: number;
  }>;
  applied_vat_rate_pct: number;
  period_start_iso: string;
  period_end_iso: string;
} {
  // Single-rate model — same as the SmartBill/SAGA export. VAT is inclusive
  // in total_ron, so net = total / (1 + rate/100), vat = total - net.
  let gross = 0;
  let count = 0;
  for (const o of orders) {
    if (o.payment_status !== 'PAID') continue;
    gross += num(o.total_ron);
    count += 1;
  }
  const rate = vatRatePct;
  const net = rate === 0 ? gross : gross / (1 + rate / 100);
  const vatDue = gross - net;
  return {
    rows:
      gross === 0
        ? []
        : [
            {
              vat_rate_pct: rate,
              gross_ron: round2(gross),
              net_ron: round2(net),
              vat_due_ron: round2(vatDue),
              order_count: count,
            },
          ],
    applied_vat_rate_pct: rate,
    period_start_iso: periodStartIso,
    period_end_iso: periodEndIso,
  };
}

export function aggregatePredictedPayouts(
  courierOrders: CourierOrderRow[],
  generatedAtIso: string,
): {
  predicted_payouts: Array<{
    date: string;
    beneficiary_type: 'courier' | 'fleet';
    beneficiary_id: string | null;
    amount_estimate_ron: number;
    confidence: number;
  }>;
  basis_sample_size: number;
  generated_at_iso: string;
} {
  // Build per-(weekday, courier) average from the last 28 days of DELIVERED
  // orders. Then project that average forward 7 days.
  const byKey = new Map<string, { sum: number; n: number }>(); // key = courier_id|weekday
  let basisN = 0;

  for (const c of courierOrders) {
    if (c.status !== 'DELIVERED') continue;
    const courierId = c.assigned_courier_user_id ?? '__unassigned__';
    const weekday = new Date(c.created_at).getUTCDay(); // 0..6 (UTC). Good enough for a 7d projection.
    const key = `${courierId}|${weekday}`;
    let b = byKey.get(key);
    if (!b) {
      b = { sum: 0, n: 0 };
      byKey.set(key, b);
    }
    b.sum += num(c.delivery_fee_ron);
    b.n += 1;
    basisN += 1;
  }

  // Sample-size → confidence: 0 samples = 0; 4+ weeks of data per
  // (courier, weekday) caps at 0.9. We never claim 1.0 (this is a
  // heuristic, not a forecast).
  function confidenceOf(samples: number): number {
    if (samples <= 0) return 0;
    if (samples >= 4) return 0.9;
    return Math.min(0.9, samples / 4) * 0.9;
  }

  const start = new Date(generatedAtIso);
  // Project 7 days forward, one row per (date, courier). If no rows for a
  // weekday, we skip — better to omit than show a 0 RON line.
  const out: Array<{
    date: string;
    beneficiary_type: 'courier' | 'fleet';
    beneficiary_id: string | null;
    amount_estimate_ron: number;
    confidence: number;
  }> = [];

  for (let d = 0; d < 7; d++) {
    const day = new Date(start.getTime() + d * 86_400_000);
    const weekday = day.getUTCDay();
    const dateKey = bucharestDateKey(day.toISOString());

    for (const [key, b] of byKey.entries()) {
      const [courierId, wdStr] = key.split('|');
      if (Number(wdStr) !== weekday) continue;
      const avg = b.n > 0 ? b.sum / b.n : 0;
      if (avg <= 0) continue;
      out.push({
        date: dateKey,
        beneficiary_type: 'courier' as const,
        beneficiary_id: courierId === '__unassigned__' ? null : courierId,
        amount_estimate_ron: round2(avg),
        confidence: confidenceOf(b.n),
      });
    }
  }

  return {
    predicted_payouts: out,
    basis_sample_size: basisN,
    generated_at_iso: generatedAtIso,
  };
}

// ---------------------------------------------------------------------------
// Per-intent handlers
// ---------------------------------------------------------------------------

// Page size for paginated reads. Picked so a high-volume tenant
// (~200 orders/day × 30 days = 6000 rows) gets through in 6 round-trips.
const PAGE_SIZE = 1000;
// Hard ceiling to bound memory + cost on a runaway tenant. ~50k orders
// per 30d would mean a unicorn restaurant; we still cap to defend the
// Edge Function memory limit.
const MAX_ROWS = 50_000;

// Helper: paginated select. Iterates with `.range(from, to)` until either
// (a) a page returns fewer rows than PAGE_SIZE, or (b) MAX_ROWS reached.
// Codex P2 (round 1, PR #366): single `.limit(5000)` silently dropped
// rows for high-volume tenants, under-reporting revenue.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function paginatedSelect<T>(buildBase: () => any): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await buildBase().range(from, to);
    if (error) throw new Error(`paginated_query_failed: ${error.message}`);
    const rows = (data as T[]) ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    if (out.length >= MAX_ROWS) {
      console.warn(
        `[finance-agent] paginatedSelect hit MAX_ROWS=${MAX_ROWS}; remaining rows ignored`,
      );
      break;
    }
    from += PAGE_SIZE;
  }
  return out;
}

// Service-role bypasses RLS, but we still scope by tenant_id for
// correctness + defense-in-depth.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchOrders(supabase: any, tenantId: string, sinceIso: string, untilIso: string): Promise<OrderRow[]> {
  return paginatedSelect<OrderRow>(() =>
    supabase
      .from('restaurant_orders')
      .select('id, created_at, total_ron, subtotal_ron, delivery_fee_ron, payment_status')
      .eq('tenant_id', tenantId)
      .gte('created_at', sinceIso)
      .lt('created_at', untilIso)
      .order('created_at', { ascending: true }),
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchPspPayments(supabase: any, tenantId: string, orderIds: string[]): Promise<PspPaymentRow[]> {
  if (orderIds.length === 0) return [];
  const { data, error } = await supabase
    .from('psp_payments')
    .select('order_id, hir_fee_bani, status')
    .eq('tenant_id', tenantId)
    .in('order_id', orderIds);
  if (error) {
    // psp_payments is admin-only RLS but service-role bypasses; still, if
    // the query fails we degrade gracefully (HIR fees become 0).
    console.warn('[finance-agent] psp_payments query failed:', error.message);
    return [];
  }
  return (data as PspPaymentRow[]) ?? [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchCourierOrders(supabase: any, tenantId: string, sinceIso: string, untilIso: string): Promise<CourierOrderRow[]> {
  try {
    return await paginatedSelect<CourierOrderRow>(() =>
      supabase
        .from('courier_orders')
        .select('id, source_tenant_id, delivery_fee_ron, status, assigned_courier_user_id, created_at')
        .eq('source_tenant_id', tenantId)
        .gte('created_at', sinceIso)
        .lt('created_at', untilIso)
        .order('created_at', { ascending: true }),
    );
  } catch (e) {
    console.warn('[finance-agent] courier_orders query failed:', e instanceof Error ? e.message : String(e));
    return [];
  }
}

// `finance.cash_flow_30d` — no input. Returns daily flow + totals + runway.
const cashFlow30dHandler: IntentHandler = {
  plan: async (_ctx, _payload) => {
    const now = Date.now();
    const since = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const until = new Date(now).toISOString();
    return {
      actionCategory: 'analytics.read',
      summary: 'Raport flux numerar — ultimele 30 de zile.',
      resolvedPayload: { period_start_iso: since, period_end_iso: until },
    };
  },
  execute: async (ctx, plan) => {
    const since = String(plan.resolvedPayload?.period_start_iso ?? '');
    const until = String(plan.resolvedPayload?.period_end_iso ?? '');

    const cap = await checkDailyCap(ctx.supabase, ctx.tenantId);
    if (cap.capped) throw new Error('daily_cap_reached');

    const orders = await fetchOrders(ctx.supabase, ctx.tenantId, since, until);
    const orderIds = orders.map((o) => o.id);
    const psp = await fetchPspPayments(ctx.supabase, ctx.tenantId, orderIds);
    const courier = await fetchCourierOrders(ctx.supabase, ctx.tenantId, since, until);

    const agg = aggregateCashFlow(orders, psp, courier, since, until);

    // Runway: average daily NET / current liquid cash. We don't have a
    // liquid-cash reading, so this stays null. Hepy narrates accordingly.
    const runway: number | null = null;

    const narration = await tryNarrate(
      [
        `Perioadă: ultimele 30 de zile.`,
        `Comenzi plătite: ${agg.totals.order_count}.`,
        `Venit brut: ${agg.totals.gross_revenue_ron} RON.`,
        `Comisioane HIR: ${agg.totals.hir_fees_ron} RON.`,
        `Net către restaurant: ${agg.totals.net_to_restaurant_ron} RON.`,
        `Plăți curieri: ${agg.totals.courier_payouts_ron} RON.`,
        `Sintetizați în 1-2 propoziții formale, în română.`,
      ].join('\n'),
    );

    return {
      summary: `Flux 30d: ${agg.totals.order_count} comenzi, net ${agg.totals.net_to_restaurant_ron.toFixed(2)} RON.`,
      data: {
        daily: agg.daily,
        totals: agg.totals,
        runway_days_estimate: runway,
        period_start_iso: since,
        period_end_iso: until,
        commentary: narration.commentary,
        cost_usd: narration.costUsd,
      },
    };
  },
};

// `finance.tax_summary_month` — input: { year?, month? } (default: current).
const taxSummaryMonthHandler: IntentHandler = {
  plan: async (_ctx, payload) => {
    const p = (payload ?? {}) as Record<string, unknown>;
    // Codex P2 (round 1, PR #366): default year+month must be the
    // tenant's LOCAL Bucharest calendar month, not UTC. Otherwise the
    // first 2-3h after Bucharest midnight on the 1st of a month gets
    // last month's report by accident.
    const nowBucharest = bucharestDateKey(new Date().toISOString()); // YYYY-MM-DD local
    const [bucharestYearStr, bucharestMonthStr] = nowBucharest.split('-');
    const year =
      typeof p.year === 'number' && p.year >= 2024 && p.year <= 2100
        ? p.year
        : Number(bucharestYearStr);
    const month =
      typeof p.month === 'number' && p.month >= 1 && p.month <= 12
        ? p.month
        : Number(bucharestMonthStr);
    const { startIso, endIso } = monthBoundsUtc(year, month - 1);
    return {
      actionCategory: 'analytics.read',
      summary: `Sumar TVA — ${String(month).padStart(2, '0')}.${year}.`,
      resolvedPayload: { year, month, period_start_iso: startIso, period_end_iso: endIso },
    };
  },
  execute: async (ctx, plan) => {
    const since = String(plan.resolvedPayload?.period_start_iso ?? '');
    const until = String(plan.resolvedPayload?.period_end_iso ?? '');
    const year = Number(plan.resolvedPayload?.year ?? 0);
    const month = Number(plan.resolvedPayload?.month ?? 0);

    const cap = await checkDailyCap(ctx.supabase, ctx.tenantId);
    if (cap.capped) throw new Error('daily_cap_reached');

    const vatRate = await readTenantVatRate(ctx.supabase, ctx.tenantId);
    const orders = await fetchOrders(ctx.supabase, ctx.tenantId, since, until);
    const summary = aggregateTaxSummary(orders, vatRate, since, until);

    const totalGross = summary.rows.reduce((s, r) => s + r.gross_ron, 0);
    const totalVat = summary.rows.reduce((s, r) => s + r.vat_due_ron, 0);

    const narration = await tryNarrate(
      [
        `Perioadă: ${String(month).padStart(2, '0')}.${year}.`,
        `Cota TVA aplicată: ${vatRate}%.`,
        `Brut total: ${round2(totalGross)} RON.`,
        `TVA datorat: ${round2(totalVat)} RON.`,
        `Sintetizați în 1-2 propoziții formale, în română.`,
        `Reaminteste explicit ca acest raport este ORIENTATIV si NU se trimite automat la ANAF.`,
      ].join('\n'),
    );

    return {
      summary: `TVA ${String(month).padStart(2, '0')}.${year}: ${round2(totalVat)} RON datorat.`,
      data: {
        rows: summary.rows,
        period_start_iso: since,
        period_end_iso: until,
        applied_vat_rate_pct: vatRate,
        commentary: narration.commentary,
        cost_usd: narration.costUsd,
        // Explicit safety pin — consumed by UI to render a banner.
        is_advisory_only: true,
      },
    };
  },
};

// `finance.predict_payouts_next_week` — no input. Reads last 28d, projects 7d.
const predictPayoutsNextWeekHandler: IntentHandler = {
  plan: async (_ctx, _payload) => {
    const now = Date.now();
    const since = new Date(now - 28 * 24 * 60 * 60 * 1000).toISOString();
    const until = new Date(now).toISOString();
    return {
      actionCategory: 'analytics.read',
      summary: 'Previziune plăți curieri — 7 zile.',
      resolvedPayload: { basis_start_iso: since, basis_end_iso: until },
    };
  },
  execute: async (ctx, plan) => {
    const since = String(plan.resolvedPayload?.basis_start_iso ?? '');
    const until = String(plan.resolvedPayload?.basis_end_iso ?? '');

    const cap = await checkDailyCap(ctx.supabase, ctx.tenantId);
    if (cap.capped) throw new Error('daily_cap_reached');

    const courier = await fetchCourierOrders(ctx.supabase, ctx.tenantId, since, until);
    const generatedAt = new Date().toISOString();
    const report = aggregatePredictedPayouts(courier, generatedAt);

    const totalEstimate = report.predicted_payouts.reduce((s, p) => s + p.amount_estimate_ron, 0);
    const couriersCovered = new Set(report.predicted_payouts.map((p) => p.beneficiary_id)).size;

    const narration = await tryNarrate(
      [
        `Bază: ultimele 28 de zile, ${report.basis_sample_size} livrări finalizate.`,
        `Previziune 7 zile: ${round2(totalEstimate)} RON pentru ${couriersCovered} curier(i).`,
        `Sintetizați în 1-2 propoziții formale, în română. Mentioneaza ca este o estimare bazata pe pattern-ul saptamanii trecute.`,
      ].join('\n'),
    );

    return {
      summary: `Previziune 7d: ${round2(totalEstimate).toFixed(2)} RON pentru ${couriersCovered} curier(i).`,
      data: {
        predicted_payouts: report.predicted_payouts,
        basis_sample_size: report.basis_sample_size,
        generated_at_iso: report.generated_at_iso,
        commentary: narration.commentary,
        cost_usd: narration.costUsd,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Registration — call this once on Edge Function cold start.
// ---------------------------------------------------------------------------

export function registerFinanceAgentIntents(): void {
  registerIntent({
    name: 'finance.cash_flow_30d',
    agent: 'finance',
    defaultCategory: 'analytics.read',
    description: 'Flux numerar pe ultimele 30 de zile (zilnic + total + runway).',
    readOnly: true,
    handler: cashFlow30dHandler,
  });
  registerIntent({
    name: 'finance.tax_summary_month',
    agent: 'finance',
    defaultCategory: 'analytics.read',
    description: 'Sumar TVA pe luna curentă (sau lună aleasă) — orientativ, NU se trimite la ANAF.',
    readOnly: true,
    handler: taxSummaryMonthHandler,
  });
  registerIntent({
    name: 'finance.predict_payouts_next_week',
    agent: 'finance',
    defaultCategory: 'analytics.read',
    description: 'Previziune plăți curieri pentru următoarele 7 zile, bazată pe ultimele 4 săptămâni.',
    readOnly: true,
    handler: predictPayoutsNextWeekHandler,
  });
}

// Test-only export.
export const __TESTING__ = {
  cashFlow30dHandler,
  taxSummaryMonthHandler,
  predictPayoutsNextWeekHandler,
  checkDailyCap,
  aggregateCashFlow,
  aggregateTaxSummary,
  aggregatePredictedPayouts,
  monthBoundsUtc,
  bucharestDateKey,
  readTenantVatRate,
};

// HandlerContext / HandlerPlan / HandlerResult are imported from
// master-orchestrator.ts. Re-export the references so tests can type
// the mock contexts without re-importing from the master file.
export type { HandlerContext, HandlerPlan, HandlerResult };
