// Ops Agent — Deno-side canonical runtime (Sprint 14).
//
// Registered with the Master Orchestrator (PR #341) as the second
// sub-agent. Three intents per the lane brief OPS-AGENT-SPRINT-14:
//
//   ops.suggest_delivery_zones      — propose 1-3 NEW delivery zones
//                                     (polygon or radius+center) based on
//                                     last-30d order destination density.
//   ops.optimize_courier_schedule   — propose hourly staffing plan based
//                                     on last-14d hour-of-week order
//                                     histogram vs courier-shifts.
//   ops.flag_kitchen_bottlenecks    — flag menu items whose end-to-end
//                                     fulfilment span (DELIVERED) sits in
//                                     the slow tail of the last-7d window.
//
// All three are READ-ONLY (`readOnly: true`): they only query the
// tenant's data, call Sonnet for natural-language framing, and return
// structured JSON. They do NOT write back to delivery_zones,
// fleet_managers, restaurant_orders, or any operational table — per
// lane brief: "All outputs are SUGGESTIONS for OWNER review — never
// auto-apply." Because of this, no proposals table is needed; the
// caller (Telegram bot, dashboard widget) renders the result payload.
//
// PROXY DOCUMENTATION (intent 3):
//   The schema does NOT have prep_time, status_changed_at, or an
//   order_status_history table. We approximate per-item fulfilment
//   time using `EXTRACT(EPOCH FROM updated_at - created_at) / 60`
//   over orders with status='DELIVERED' that contain the item in
//   `items` jsonb. This conflates kitchen prep + dispatch + delivery,
//   so the avg/p95 numbers are NOT pure kitchen prep — they're
//   fulfilment span (the metric is still useful for relative
//   ranking; the slowest items are still the ones to fix). The
//   target is computed as the median across all items in the same
//   tenant's catalogue, so "above target" means "slower than the
//   typical item in this kitchen". Sprint 15 should replace this
//   with real kitchen timestamps once order_status_history lands.
//
// Cost target: ~$0.02 per invocation per intent. Input ~3k tokens
// (data sample + system prompt), output ~1.5k tokens at Sonnet 4.5
// = $0.009 + $0.022 ≈ $0.031. We aim a touch above the brief's
// ~$0.02 target on intent 1 because the geo data is verbose; intents
// 2 + 3 land around $0.015. Daily cap = 10 per tenant per day.

import {
  registerIntent,
  type HandlerContext,
  type HandlerPlan,
  type HandlerResult,
  type IntentHandler,
} from './master-orchestrator.ts';

// ---------------------------------------------------------------------------
// Constants — kept in sync with apps/restaurant-admin/src/lib/ai/agents/ops-agent.ts
// ---------------------------------------------------------------------------

export const OPS_AGENT_MODEL = 'claude-sonnet-4-5-20250929';
export const DAILY_INVOCATION_CAP = 10;
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const INPUT_COST_PER_TOKEN_USD = 3.0 / 1_000_000;
const OUTPUT_COST_PER_TOKEN_USD = 15.0 / 1_000_000;

// Window sizes per intent (days). Tuned so each intent samples enough
// signal without exploding the input prompt.
const ZONES_WINDOW_DAYS = 30;
const SCHEDULE_WINDOW_DAYS = 14;
const BOTTLENECKS_WINDOW_DAYS = 7;

// Hard caps to keep Anthropic input bounded regardless of tenant volume.
const MAX_GEO_POINTS = 500; // last-30d order destinations
const MAX_BOTTLENECK_ITEMS = 30; // top-N items by order count to score

// ---------------------------------------------------------------------------
// Validators (no Zod in the Edge bundle)
// ---------------------------------------------------------------------------

function nonEmptyString(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t.length > max) return null;
  return t;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function clampNumber(v: unknown, min: number, max: number): number | null {
  // Codex P2 (PR #364 round 6): require an actual JSON number, not a
  // numeric string. Anthropic emits properly-typed numbers — accepting
  // "45.65" here would let a string reach the output payload while the
  // admin mirror schemas + downstream renderers expect number. We do
  // the strict check at this single chokepoint so all callers (lat,
  // lng, hour, est_orders_per_day, etc.) get the same guarantee.
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) return null;
  return v;
}

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// ---------------------------------------------------------------------------
// Local-time bucketing — Codex P2 (PR #364 round 1). The schedule prompt
// describes `hour` as Europe/Bucharest local; Postgres timestamptz returns
// UTC. We use Intl.DateTimeFormat to derive RO-local components, which
// handles DST transitions correctly without us shipping a tz database.
// ---------------------------------------------------------------------------

const LOCAL_TZ = 'Europe/Bucharest';

// Lazy-init shared formatter (Deno + Node both support this; Edge runtime
// has full ICU). Format string yields year-month-day-weekday-hour parts.
const _localFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: LOCAL_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
  weekday: 'short',
});

const _weekdayToDow: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function bucketToLocalParts(d: Date): { dow: number | null; hour: number | null; dateKey: string | null } {
  if (!Number.isFinite(d.getTime())) return { dow: null, hour: null, dateKey: null };
  const parts = _localFmt.formatToParts(d);
  let weekday = '';
  let year = '';
  let month = '';
  let day = '';
  let hour = '';
  for (const p of parts) {
    if (p.type === 'weekday') weekday = p.value;
    else if (p.type === 'year') year = p.value;
    else if (p.type === 'month') month = p.value;
    else if (p.type === 'day') day = p.value;
    else if (p.type === 'hour') hour = p.value;
  }
  const dow = _weekdayToDow[weekday] ?? null;
  const hourNum = hour ? Number(hour) % 24 : null; // some locales return 24:00
  if (dow === null || hourNum === null || !year || !month || !day) {
    return { dow: null, hour: null, dateKey: null };
  }
  return { dow, hour: hourNum, dateKey: `${year}-${month}-${day}` };
}

function bucketToLocal(iso: string): { dow: number | null; hour: number | null } {
  const d = new Date(iso);
  const parts = bucketToLocalParts(d);
  return { dow: parts.dow, hour: parts.hour };
}

// ---------------------------------------------------------------------------
// Anthropic client (raw fetch, Deno-friendly) — same shape as menu-agent.ts
// ---------------------------------------------------------------------------

type AnthropicResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

let fetchOverride: typeof fetch | null = null;
export function setFetchForTesting(f: typeof fetch | null): void {
  fetchOverride = f;
}

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
      model: OPS_AGENT_MODEL,
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
  if (!text) throw new Error('anthropic_empty_response');
  return {
    text,
    inputTokens: Number(data?.usage?.input_tokens ?? 0),
    outputTokens: Number(data?.usage?.output_tokens ?? 0),
  };
}

function extractJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(trimmed);
}

function costUsdOf(input: number, output: number): number {
  return input * INPUT_COST_PER_TOKEN_USD + output * OUTPUT_COST_PER_TOKEN_USD;
}

async function getApiKey(): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const key = (globalThis as any).Deno?.env?.get?.('ANTHROPIC_API_KEY') ?? '';
  if (!key) throw new Error('anthropic_missing_api_key');
  return key;
}

// ---------------------------------------------------------------------------
// Daily cap helpers — share the same `ops_agent_invocations` semantics as
// menu_agent_invocations but we don't introduce a new table for Sprint 14
// (NO new tables per lane brief). Instead, we count rows in the existing
// `copilot_agent_runs` ledger filtered by agent_name='ops' over the last
// 24 h. The dispatcher writes that row for us, so this works for every
// channel that goes through dispatchIntent.
//
// IMPORTANT: this counts SUCCESSFUL invocations only (state='EXECUTED'),
// because failed plan() calls never reach writeLedger. Capped attempts
// raise a 'daily_cap_reached' error from the handler, which surfaces as
// `error: handler_threw` from the dispatcher — no ledger row written, so
// repeated retries don't extend the lockout window. Same behaviour as
// menu-agent's invocation table after Codex P2 round 1 fix.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkDailyCap(supabase: any, tenantId: string): Promise<{ count: number; capped: boolean }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('copilot_agent_runs')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', tenantId)
    .eq('agent_name', 'ops')
    .eq('state', 'EXECUTED')
    .gte('created_at', since);
  if (error) {
    console.warn('[ops-agent] checkDailyCap failed:', error.message);
    return { count: 0, capped: false };
  }
  const n = typeof count === 'number' ? count : 0;
  return { count: n, capped: n >= DAILY_INVOCATION_CAP };
}

// ---------------------------------------------------------------------------
// Data-gathering queries — small, scoped, multi-tenant-safe. All filter on
// tenant_id and read existing tables only.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchExistingZones(supabase: any, tenantId: string): Promise<Array<{ name: string; polygon: unknown }>> {
  const { data, error } = await supabase
    .from('delivery_zones')
    .select('name, polygon')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .limit(50);
  if (error) {
    console.warn('[ops-agent] fetchExistingZones failed:', error.message);
    return [];
  }
  return (data ?? []) as Array<{ name: string; polygon: unknown }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchOrderDestinations(supabase: any, tenantId: string): Promise<Array<{ lat: number; lng: number }>> {
  const since = new Date(Date.now() - ZONES_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  // Two-step: orders → address ids, then addresses → lat/lng. We don't
  // rely on a Postgres join here because supabase-js's nested select
  // requires an FK-named relation and we want to keep this resilient to
  // schema renames.
  const { data: orders, error: ordErr } = await supabase
    .from('restaurant_orders')
    .select('delivery_address_id')
    .eq('tenant_id', tenantId)
    .gte('created_at', since)
    .not('delivery_address_id', 'is', null)
    .limit(MAX_GEO_POINTS);
  if (ordErr) {
    console.warn('[ops-agent] fetchOrderDestinations orders failed:', ordErr.message);
    return [];
  }
  const orderAddressIds = (orders ?? [])
    .map((o: { delivery_address_id: string | null }) => o.delivery_address_id)
    .filter((x: string | null): x is string => !!x);
  if (orderAddressIds.length === 0) return [];

  // Codex P2 (PR #364 round 4): preserve one point per order, not per
  // unique address. Repeat customers in a new neighborhood would
  // otherwise be deduplicated and the density signal collapsed.
  const uniqueAddressIds = Array.from(new Set(orderAddressIds));
  const { data: addrs, error: addrErr } = await supabase
    .from('customer_addresses')
    .select('id, latitude, longitude')
    .in('id', uniqueAddressIds)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);
  if (addrErr) {
    console.warn('[ops-agent] fetchOrderDestinations addresses failed:', addrErr.message);
    return [];
  }
  // Build addressId → coords map, then re-expand by orderAddressIds so a
  // neighborhood with 12 orders to the same delivery address still
  // contributes 12 points (capped by MAX_GEO_POINTS at the order step).
  const coordsByAddr = new Map<string, { lat: number; lng: number }>();
  for (const r of (addrs ?? []) as Array<{ id: string; latitude: number | null; longitude: number | null }>) {
    if (isFiniteNumber(r.latitude) && isFiniteNumber(r.longitude)) {
      coordsByAddr.set(r.id, { lat: r.latitude, lng: r.longitude });
    }
  }
  const points: Array<{ lat: number; lng: number }> = [];
  for (const id of orderAddressIds) {
    const coords = coordsByAddr.get(id);
    if (coords) points.push(coords);
  }
  return points;
}

// Returns [day_of_week 0-6, hour 0-23] -> count, plus average online
// couriers per (dow, hour) bucket from the last 14d of shifts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchScheduleHeatmap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tenantId: string,
): Promise<{
  orderCounts: Array<{ dow: number; hour: number; orders: number }>;
  courierAvg: Array<{ dow: number; hour: number; avg_couriers: number }>;
  fleetManagerCount: number;
}> {
  const since = new Date(Date.now() - SCHEDULE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: orders, error: ordErr } = await supabase
    .from('restaurant_orders')
    .select('created_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', since)
    .limit(5000);
  if (ordErr) {
    console.warn('[ops-agent] fetchScheduleHeatmap orders failed:', ordErr.message);
  }
  // Codex P2 (PR #364 round 1): bucket in Europe/Bucharest local time, not
  // UTC. Postgres stores timestamptz in UTC; if we used getUTCDay()/getUTCHours()
  // a 19:00 RO local peak would land in the 16:00 (or 17:00 during DST) UTC
  // bucket, and the schedule prompt — which says "hour is local Europe/Bucharest"
  // — would mislead the model into recommending couriers 2-3 hours early.
  //
  // Codex P2 (PR #364 round 5): normalize by the number of observed
  // calendar dates per (dow, hour) bucket so the model receives an
  // average per occurrence, not the cumulative total. Without this,
  // 4 orders × 2 Mondays at 19:00 → orders=8 and the prompt
  // (sizing by 3-5 orders/hour) staffs ~double the actual hourly demand.
  type OrderHist = { sum: number; days: Set<string> };
  const orderBuckets: Map<string, OrderHist> = new Map();
  for (const o of orders ?? []) {
    const created = (o as { created_at: string }).created_at;
    const parts = bucketToLocalParts(new Date(created));
    if (parts.dow === null || parts.hour === null || parts.dateKey === null) continue;
    const k = `${parts.dow}:${parts.hour}`;
    const cur = orderBuckets.get(k) ?? { sum: 0, days: new Set<string>() };
    cur.sum += 1;
    cur.days.add(parts.dateKey);
    orderBuckets.set(k, cur);
  }
  const orderCounts: Array<{ dow: number; hour: number; orders: number }> = [];
  for (const [k, v] of orderBuckets.entries()) {
    const [dowStr, hourStr] = k.split(':');
    const days = Math.max(1, v.days.size);
    orderCounts.push({
      dow: Number(dowStr),
      hour: Number(hourStr),
      // Average orders per observed occurrence, rounded to 1 decimal.
      orders: +(v.sum / days).toFixed(1),
    });
  }

  // Courier capacity: courier_shifts started/ended over the same window.
  // We count "online courier-hours" per (dow, hour) bucket and divide by
  // the number of distinct calendar days that overlapped that bucket.
  //
  // Codex P2 (PR #364 round 1 + 4): scope shifts to couriers who actually
  // served THIS tenant. courier_shifts has no direct tenant_id; without
  // a filter we'd count every fleet's shifts and recommend under-staffing
  // for tenants whose actual courier roster is small.
  //
  // Two complementary sources:
  //  (a) restaurant_orders.courier_user_id — primary path. Restaurant-
  //      direct dispatch (Mode A / B) writes the courier here when the
  //      order is handed off. This is the canonical roster for non-
  //      pharma tenants per migration 20260603_002_phase1_fleet_schema.sql.
  //  (b) courier_orders.assigned_courier_user_id where source_tenant_id
  //      = $tenantId — covers fleet-routed orders that mirror through
  //      the unified courier_orders table (HIR via Fleet Network).
  //      Restaurant orders are NOT auto-mirrored, so (a) is the bigger
  //      source for most tenants; we union both to be safe.
  const [
    { data: rOrders, error: rOrdersErr },
    { data: cOrders, error: cOrdersErr },
  ] = await Promise.all([
    supabase
      .from('restaurant_orders')
      .select('courier_user_id')
      .eq('tenant_id', tenantId)
      .gte('created_at', since)
      .not('courier_user_id', 'is', null)
      .limit(5000),
    supabase
      .from('courier_orders')
      .select('assigned_courier_user_id')
      .eq('source_tenant_id', tenantId)
      .gte('created_at', since)
      .not('assigned_courier_user_id', 'is', null)
      .limit(5000),
  ]);
  if (rOrdersErr) {
    console.warn('[ops-agent] fetchScheduleHeatmap restaurant_orders courier ids failed:', rOrdersErr.message);
  }
  if (cOrdersErr) {
    console.warn('[ops-agent] fetchScheduleHeatmap courier_orders ids failed:', cOrdersErr.message);
  }
  const tenantCourierIds = Array.from(
    new Set([
      ...((rOrders ?? []) as Array<{ courier_user_id: string | null }>)
        .map((r) => r.courier_user_id)
        .filter((x): x is string => !!x),
      ...((cOrders ?? []) as Array<{ assigned_courier_user_id: string | null }>)
        .map((r) => r.assigned_courier_user_id)
        .filter((x): x is string => !!x),
    ]),
  );

  type Hist = { sumHours: number; days: Set<string> };
  const courierBuckets: Map<string, Hist> = new Map();
  // If no courier ever served this tenant in the window, we can't compute
  // capacity — skip the shifts query entirely (and avoid leaking other
  // fleets' data). The handler will report current_avg=0 which is correct.
  if (tenantCourierIds.length > 0) {
    const { data: shifts, error: shiftsErr } = await supabase
      .from('courier_shifts')
      .select('started_at, ended_at')
      .in('courier_user_id', tenantCourierIds)
      .gte('started_at', since)
      .limit(5000);
    if (shiftsErr) {
      console.warn('[ops-agent] fetchScheduleHeatmap shifts failed:', shiftsErr.message);
    }
    for (const s of shifts ?? []) {
      const start = new Date((s as { started_at: string }).started_at);
      const endRaw = (s as { ended_at: string | null }).ended_at;
      const end = endRaw ? new Date(endRaw) : new Date();
      if (!Number.isFinite(start.getTime()) || end <= start) continue;
      // Walk the shift hour-by-hour. Cap at 24 h to keep this loop bounded
      // (defensive: a stuck ONLINE shift could otherwise run for days).
      let cursor = new Date(start.getTime());
      let safety = 0;
      while (cursor < end && safety < 24) {
        // Same Europe/Bucharest local-time bucketing as orders above
        // (Codex P2 PR #364 round 1).
        const { dow, hour, dateKey } = bucketToLocalParts(cursor);
        if (dow === null || hour === null || dateKey === null) {
          cursor = new Date(cursor.getTime() + 60 * 60 * 1000);
          safety += 1;
          continue;
        }
        const k = `${dow}:${hour}`;
        const next = new Date(cursor.getTime() + 60 * 60 * 1000);
        const sliceEnd = next < end ? next : end;
        const portionMs = sliceEnd.getTime() - cursor.getTime();
        const portionHours = portionMs / (60 * 60 * 1000);
        const cur = courierBuckets.get(k) ?? { sumHours: 0, days: new Set<string>() };
        cur.sumHours += portionHours;
        cur.days.add(dateKey);
        courierBuckets.set(k, cur);
        cursor = next;
        safety += 1;
      }
    }
  }
  const courierAvg: Array<{ dow: number; hour: number; avg_couriers: number }> = [];
  for (const [k, v] of courierBuckets.entries()) {
    const [dowStr, hourStr] = k.split(':');
    const days = Math.max(1, v.days.size);
    courierAvg.push({ dow: Number(dowStr), hour: Number(hourStr), avg_couriers: +(v.sumHours / days).toFixed(2) });
  }

  // Fleet managers = tenant_members rows with role='FLEET_MANAGER' for
  // this tenant. We pass the count as context (suggests how much the
  // tenant can lean on dispatch coordination during peaks).
  const { count: fmCount, error: fmErr } = await supabase
    .from('tenant_members')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('role', 'FLEET_MANAGER');
  if (fmErr) {
    console.warn('[ops-agent] fetchScheduleHeatmap fm failed:', fmErr.message);
  }
  return {
    orderCounts,
    courierAvg,
    fleetManagerCount: typeof fmCount === 'number' ? fmCount : 0,
  };
}

// Per-item fulfilment span over the last 7d. PROXY documented at file
// header — this is end-to-end span (created_at → updated_at on DELIVERED),
// not pure kitchen prep. Returned as [{id, name, count, avg_min, p95_min}].
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchItemFulfilmentTimes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tenantId: string,
): Promise<Array<{ id: string; name: string; count: number; avg_min: number; p95_min: number }>> {
  const since = new Date(Date.now() - BOTTLENECKS_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: orders, error: ordErr } = await supabase
    .from('restaurant_orders')
    .select('items, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'DELIVERED')
    .gte('created_at', since)
    .limit(2000);
  if (ordErr) {
    console.warn('[ops-agent] fetchItemFulfilmentTimes orders failed:', ordErr.message);
    return [];
  }

  // Aggregate per item_id.
  type Acc = { spans: number[]; name: string };
  const acc: Map<string, Acc> = new Map();
  for (const row of orders ?? []) {
    const r = row as { items: unknown; created_at: string; updated_at: string };
    const created = new Date(r.created_at).getTime();
    const updated = new Date(r.updated_at).getTime();
    if (!Number.isFinite(created) || !Number.isFinite(updated) || updated <= created) continue;
    const minutes = (updated - created) / 60000;
    // Sanity: discard >6h spans (bad data, app crash, manual re-status).
    if (minutes > 360) continue;
    const items = Array.isArray(r.items) ? r.items : [];
    for (const it of items) {
      if (!it || typeof it !== 'object') continue;
      // Codex P2 (PR #364 round 1): real storefront orders persist
      // PricedLineItem with `itemId` (camelCase) — see
      // apps/restaurant-web/src/app/api/checkout/pricing.ts. Earlier
      // versions / external API rows may use `id`. Read both, prefer
      // itemId when present.
      const x = it as { itemId?: unknown; id?: unknown; name?: unknown };
      const candidateId = isUuid(x.itemId) ? x.itemId : isUuid(x.id) ? x.id : null;
      const name = nonEmptyString(x.name, 200);
      if (!candidateId || !name) continue;
      const cur = acc.get(candidateId) ?? { spans: [], name };
      cur.spans.push(minutes);
      // First non-empty name wins (item rename across orders is rare).
      acc.set(candidateId, cur);
    }
  }

  const out: Array<{ id: string; name: string; count: number; avg_min: number; p95_min: number }> = [];
  for (const [id, v] of acc.entries()) {
    if (v.spans.length < 3) continue; // need 3+ data points for stable signal
    const sorted = [...v.spans].sort((a, b) => a - b);
    const sum = sorted.reduce((s, x) => s + x, 0);
    const avg = sum / sorted.length;
    const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    const p95 = sorted[p95Idx];
    out.push({ id, name: v.name, count: sorted.length, avg_min: +avg.toFixed(1), p95_min: +p95.toFixed(1) });
  }
  // Sort by avg desc, top N.
  out.sort((a, b) => b.avg_min - a.avg_min);
  return out.slice(0, MAX_BOTTLENECK_ITEMS);
}

// ---------------------------------------------------------------------------
// System prompts — RO formal
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_ZONES = `Ești asistentul "Hepy" pentru un restaurant din România. Pe baza zonelor existente și a coordonatelor reale ale comenzilor din ultimele 30 de zile, propui 1-3 zone NOI de livrare (sau extinderi) care ar acoperi cerere reală neacoperită.

Reguli:
- Returnezi DOAR JSON valid, fără text suplimentar, fără ghilimele de cod.
- Forma: {"proposed_zones":[{"name":"...","polygon":null,"radius_km":3.5,"center":{"lat":45.65,"lng":25.61},"justification":"...","est_orders_per_day":4.2}],"notes":"..."}.
- Pentru fiecare zonă: ALEGE FIE polygon (GeoJSON Polygon coordinates [[lng,lat],...]) FIE radius_km + center. Nu ambele simultan.
- name: scurt, în română, ex. "Tractorul-Nord", "Centru extins", maxim 120 caractere.
- justification: 1-2 propoziții; menționează numărul de comenzi observate în zonă și de ce nu sunt deja acoperite.
- est_orders_per_day: estimare rezonabilă (număr cu o zecimală, pe baza datelor primite).
- proposed_zones: maxim 3. Dacă nu există cerere semnificativă neacoperită, întoarce array gol și completează "notes".
- Nu propune zone care se suprapun major cu zonele existente.
- Toate textele în română.`;

const SYSTEM_PROMPT_SCHEDULE = `Ești asistentul "Hepy" pentru un restaurant din România. Pe baza histogramei comenzi/oră vs curieri online/oră din ultimele 14 zile, propui un program de personal pentru fiecare oră a săptămânii unde există un decalaj semnificativ.

ATENȚIE: cifra "avg_orders_per_occurrence" din input reprezintă MEDIA comenzilor pe instanță observată a (dow, hour) — adică deja per-oră, nu total cumulat. Exemplu: dacă au fost 4 comenzi la fiecare luni 19:00 timp de 2 săptămâni, primești 4.0, nu 8.0. Nu mai diviza tu.

Reguli:
- Returnezi DOAR JSON valid, fără text suplimentar.
- Forma: {"schedule":[{"day_of_week":1,"hour":19,"recommended_couriers":3,"current_avg":1.2,"gap":1.8}],"summary":"..."}.
- day_of_week: 0=Duminică, 1=Luni, ..., 6=Sâmbătă (Postgres dow).
- hour: ora locală 0-23 (presupune fus Europe/Bucharest).
- recommended_couriers: număr întreg 0-50, bazat pe presupunerea că un curier livrează 3-5 comenzi/oră în orele de vârf, aplicat direct asupra avg_orders_per_occurrence.
- current_avg: media curentă (preluată direct din input).
- gap: recommended_couriers - current_avg (poate fi negativ pentru sub-utilizare).
- schedule: maxim 168 elemente. Concentrează-te pe orele cu gap >= 1 (prioritate) sau cu gap <= -1 (sub-utilizare). Ignoră orele cu volum mic.
- summary: 1-2 propoziții care rezumă orele critice.
- Toate textele în română.`;

const SYSTEM_PROMPT_BOTTLENECKS = `Ești asistentul "Hepy" pentru un restaurant din România. Pe baza timpilor de livrare end-to-end pe ultimele 7 zile pentru fiecare produs, identifici produsele care încetinesc bucătăria.

ATENȚIE: timpii primiți reprezintă durata totală created_at→updated_at pe comenzi DELIVERED. Asta înseamnă pregătire + dispecerizare + livrare, NU doar pregătire pură. Folosește valorile pentru ordonare relativă (cele mai lente produse), nu ca măsuri absolute de prep.

Reguli:
- Returnezi DOAR JSON valid, fără text suplimentar.
- Forma: {"bottlenecks":[{"menu_item_id":"...","name":"...","avg_prep_min":35.4,"target_prep_min":22.0,"p95_prep_min":58.1,"suggestion":"..."}],"notes":"..."}.
- target_prep_min = mediana avg_min a produselor primite în input (calculează tu mediana). Aceeași valoare pentru toate rândurile.
- bottlenecks: maxim 10 produse, doar cele cu avg_prep_min > target_prep_min.
- suggestion: 1-2 propoziții în română formală cu acțiune concretă (ex. "Pre-porționați sosul în prealabil." sau "Rezervați un cuptor dedicat în orele de vârf.").
- Dacă niciun produs nu depășește mediana, întoarce array gol și explică în "notes".
- menu_item_id: copiezi exact UUID-ul primit în input.
- Toate textele în română.`;

// ---------------------------------------------------------------------------
// Result-shape validators (defence-in-depth on Anthropic JSON output)
// ---------------------------------------------------------------------------

function validateZonesShape(obj: unknown): { proposed_zones: unknown[]; notes: string } {
  const o = obj as Record<string, unknown>;
  const arr = Array.isArray(o.proposed_zones) ? o.proposed_zones : [];
  if (arr.length > 3) throw new Error('anthropic_invalid_shape: proposed_zones > 3');
  const notes = nonEmptyString(o.notes, 600) ?? '';
  for (const z of arr) {
    if (!z || typeof z !== 'object') throw new Error('anthropic_invalid_shape: zone not object');
    const zr = z as Record<string, unknown>;
    if (!nonEmptyString(zr.name, 120)) throw new Error('anthropic_invalid_shape: zone.name');
    if (!nonEmptyString(zr.justification, 400)) throw new Error('anthropic_invalid_shape: zone.justification');
    if (clampNumber(zr.est_orders_per_day, 0, 10000) === null)
      throw new Error('anthropic_invalid_shape: zone.est_orders_per_day');
    // Codex P2 (PR #364 round 2 + 3): require structural validation on
    // BOTH branches (polygon and radius+center). Otherwise `{}`,
    // `{type:'Polygon'}` without coordinates, or `{radius_km:3, center:{}}`
    // would slip through, while the admin mirror's Zod schema and the
    // map-rendering UI both expect real numeric coords. Validate inline.
    let hasPoly = false;
    if (zr.polygon && typeof zr.polygon === 'object') {
      const poly = zr.polygon as Record<string, unknown>;
      // Must be {type:'Polygon', coordinates: [[[lng,lat], ...], ...]} per GeoJSON.
      if (poly.type === 'Polygon' && Array.isArray(poly.coordinates) && poly.coordinates.length > 0) {
        const ring = poly.coordinates[0];
        if (Array.isArray(ring) && ring.length >= 3) {
          // Sample the first 8 vertices; full-ring validation is the UI's job.
          const sampleOk = ring.slice(0, 8).every((pt: unknown) => {
            if (!Array.isArray(pt) || pt.length < 2) return false;
            return clampNumber(pt[0], -180, 180) !== null && clampNumber(pt[1], -90, 90) !== null;
          });
          hasPoly = sampleOk;
        }
      }
    }
    let hasRadius = false;
    if (clampNumber(zr.radius_km, 0.01, 50) !== null && zr.center && typeof zr.center === 'object') {
      const c = zr.center as Record<string, unknown>;
      const lat = clampNumber(c.lat, -90, 90);
      const lng = clampNumber(c.lng, -180, 180);
      hasRadius = lat !== null && lng !== null;
    }
    if (!hasPoly && !hasRadius)
      throw new Error('anthropic_invalid_shape: zone needs valid polygon OR radius+center{lat,lng}');
  }
  return { proposed_zones: arr, notes };
}

function validateScheduleShape(obj: unknown): { schedule: unknown[]; summary: string } {
  const o = obj as Record<string, unknown>;
  const arr = Array.isArray(o.schedule) ? o.schedule : [];
  if (arr.length > 168) throw new Error('anthropic_invalid_shape: schedule > 168');
  const summary = nonEmptyString(o.summary, 600) ?? '';
  for (const s of arr) {
    if (!s || typeof s !== 'object') throw new Error('anthropic_invalid_shape: slot not object');
    const sr = s as Record<string, unknown>;
    if (clampNumber(sr.day_of_week, 0, 6) === null) throw new Error('anthropic_invalid_shape: day_of_week');
    if (clampNumber(sr.hour, 0, 23) === null) throw new Error('anthropic_invalid_shape: hour');
    if (clampNumber(sr.recommended_couriers, 0, 50) === null)
      throw new Error('anthropic_invalid_shape: recommended_couriers');
    if (clampNumber(sr.current_avg, 0, 50) === null) throw new Error('anthropic_invalid_shape: current_avg');
    if (typeof sr.gap !== 'number' || !Number.isFinite(sr.gap))
      throw new Error('anthropic_invalid_shape: gap');
  }
  return { schedule: arr, summary };
}

function validateBottlenecksShape(
  obj: unknown,
  validIds: Set<string>,
): { bottlenecks: unknown[]; notes: string } {
  const o = obj as Record<string, unknown>;
  const arr = Array.isArray(o.bottlenecks) ? o.bottlenecks : [];
  if (arr.length > 10) throw new Error('anthropic_invalid_shape: bottlenecks > 10');
  const notes = nonEmptyString(o.notes, 600) ?? '';
  for (const b of arr) {
    if (!b || typeof b !== 'object') throw new Error('anthropic_invalid_shape: bottleneck not object');
    const br = b as Record<string, unknown>;
    if (!isUuid(br.menu_item_id)) throw new Error('anthropic_invalid_shape: menu_item_id');
    // Hallucination guard: every returned id must come from our input.
    if (!validIds.has(br.menu_item_id as string))
      throw new Error('anthropic_item_id_mismatch: id not in input set');
    if (!nonEmptyString(br.name, 200)) throw new Error('anthropic_invalid_shape: bottleneck.name');
    if (clampNumber(br.avg_prep_min, 0, 600) === null) throw new Error('anthropic_invalid_shape: avg_prep_min');
    if (clampNumber(br.target_prep_min, 0, 600) === null)
      throw new Error('anthropic_invalid_shape: target_prep_min');
    if (clampNumber(br.p95_prep_min, 0, 600) === null) throw new Error('anthropic_invalid_shape: p95_prep_min');
    if (!nonEmptyString(br.suggestion, 400)) throw new Error('anthropic_invalid_shape: suggestion');
  }
  return { bottlenecks: arr, notes };
}

// ---------------------------------------------------------------------------
// Per-intent handlers (all read-only — plan() does the data gather + LLM
// call so the EXECUTED ledger row carries the final result; execute() is
// a thin pass-through. We deliberately put work in plan() because
// readOnly:true means the dispatcher will call execute() unconditionally
// after plan() — there is no PROPOSE_ONLY branch to worry about, and a
// single phase keeps the data-snapshot consistent.)
// ---------------------------------------------------------------------------

const suggestDeliveryZonesHandler: IntentHandler = {
  plan: async (ctx) => {
    const cap = await checkDailyCap(ctx.supabase, ctx.tenantId);
    if (cap.capped) throw new Error('daily_cap_reached');

    const [zones, points] = await Promise.all([
      fetchExistingZones(ctx.supabase, ctx.tenantId),
      fetchOrderDestinations(ctx.supabase, ctx.tenantId),
    ]);

    if (points.length < 5) {
      // Not enough data to suggest anything. Skip Anthropic, return empty.
      return {
        actionCategory: 'ops.read',
        summary: 'Prea puține comenzi geocodate în 30 zile pentru a propune zone noi.',
        resolvedPayload: {
          result: { proposed_zones: [], notes: 'Sub 5 comenzi cu coordonate în ultimele 30 de zile.' },
          inputTokens: 0,
          outputTokens: 0,
        },
      };
    }

    const apiKey = await getApiKey();
    const userMessage = [
      `Zone existente (${zones.length}):`,
      ...zones.slice(0, 20).map((z) => `- ${z.name}: ${JSON.stringify(z.polygon).slice(0, 200)}`),
      '',
      `Coordonate comenzi (ultimele 30 zile, ${points.length} puncte, lat,lng):`,
      ...points.slice(0, MAX_GEO_POINTS).map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`),
    ].join('\n');

    const raw = await callAnthropic(apiKey, SYSTEM_PROMPT_ZONES, userMessage, 1500);
    const parsed = extractJson(raw.text);
    const validated = validateZonesShape(parsed);

    return {
      actionCategory: 'ops.read',
      summary: `${validated.proposed_zones.length} zone propuse pe baza a ${points.length} comenzi.`,
      resolvedPayload: {
        result: validated,
        inputTokens: raw.inputTokens,
        outputTokens: raw.outputTokens,
      },
    };
  },
  execute: async (_ctx, plan) => {
    const result = (plan.resolvedPayload?.result ?? { proposed_zones: [], notes: '' }) as {
      proposed_zones: unknown[];
      notes: string;
    };
    return {
      summary: plan.summary,
      data: {
        kind: 'suggest_delivery_zones' as const,
        ...result,
      },
    };
  },
};

const optimizeCourierScheduleHandler: IntentHandler = {
  plan: async (ctx) => {
    const cap = await checkDailyCap(ctx.supabase, ctx.tenantId);
    if (cap.capped) throw new Error('daily_cap_reached');

    const heat = await fetchScheduleHeatmap(ctx.supabase, ctx.tenantId);
    if (heat.orderCounts.length === 0) {
      return {
        actionCategory: 'ops.read',
        summary: 'Sub 14 zile de date — niciun program propus.',
        resolvedPayload: {
          result: { schedule: [], summary: 'Date insuficiente în ultimele 14 zile.' },
          inputTokens: 0,
          outputTokens: 0,
        },
      };
    }

    const apiKey = await getApiKey();
    const orderLines = heat.orderCounts
      .sort((a, b) => (a.dow - b.dow) || (a.hour - b.hour))
      .map((r) => `dow=${r.dow} h=${r.hour} avg_orders_per_occurrence=${r.orders}`)
      .slice(0, 168);
    const courierLines = heat.courierAvg
      .sort((a, b) => (a.dow - b.dow) || (a.hour - b.hour))
      .map((r) => `dow=${r.dow} h=${r.hour} avg_couriers=${r.avg_couriers}`)
      .slice(0, 168);

    const userMessage = [
      `Histograma comenzi (ultimele 14 zile, ${heat.orderCounts.length} ferestre):`,
      ...orderLines,
      '',
      `Curieri online (medie pe oră, ${heat.courierAvg.length} ferestre):`,
      ...courierLines,
      '',
      `Manageri de flotă (FLEET_MANAGER): ${heat.fleetManagerCount}`,
    ].join('\n');

    const raw = await callAnthropic(apiKey, SYSTEM_PROMPT_SCHEDULE, userMessage, 2000);
    const parsed = extractJson(raw.text);
    const validated = validateScheduleShape(parsed);

    return {
      actionCategory: 'ops.read',
      summary: `${validated.schedule.length} ore cu decalaj identificate (14 zile).`,
      resolvedPayload: {
        result: validated,
        inputTokens: raw.inputTokens,
        outputTokens: raw.outputTokens,
      },
    };
  },
  execute: async (_ctx, plan) => {
    const result = (plan.resolvedPayload?.result ?? { schedule: [], summary: '' }) as {
      schedule: unknown[];
      summary: string;
    };
    return {
      summary: plan.summary,
      data: {
        kind: 'optimize_courier_schedule' as const,
        ...result,
      },
    };
  },
};

const flagKitchenBottlenecksHandler: IntentHandler = {
  plan: async (ctx) => {
    const cap = await checkDailyCap(ctx.supabase, ctx.tenantId);
    if (cap.capped) throw new Error('daily_cap_reached');

    const items = await fetchItemFulfilmentTimes(ctx.supabase, ctx.tenantId);
    if (items.length < 2) {
      return {
        actionCategory: 'ops.read',
        summary: 'Sub 2 produse cu suficiente date — niciun blocaj propus.',
        resolvedPayload: {
          result: {
            bottlenecks: [],
            notes: 'Sub 2 produse cu cel puțin 3 livrări în ultimele 7 zile.',
          },
          inputTokens: 0,
          outputTokens: 0,
        },
      };
    }

    const validIds = new Set(items.map((i) => i.id));
    const apiKey = await getApiKey();
    const userMessage = [
      `Timpi de livrare end-to-end pe produs (ultimele 7 zile, sortat desc după media min):`,
      ...items.map(
        (i) =>
          `id=${i.id} name="${i.name}" count=${i.count} avg_min=${i.avg_min} p95_min=${i.p95_min}`,
      ),
      '',
      'NOTĂ: timpii includ pregătire + dispecerizare + livrare; folosește pentru ordonare relativă.',
    ].join('\n');

    const raw = await callAnthropic(apiKey, SYSTEM_PROMPT_BOTTLENECKS, userMessage, 1800);
    const parsed = extractJson(raw.text);
    const validated = validateBottlenecksShape(parsed, validIds);

    return {
      actionCategory: 'ops.read',
      summary: `${validated.bottlenecks.length} blocaje identificate din ${items.length} produse.`,
      resolvedPayload: {
        result: validated,
        inputTokens: raw.inputTokens,
        outputTokens: raw.outputTokens,
      },
    };
  },
  execute: async (_ctx, plan) => {
    const result = (plan.resolvedPayload?.result ?? { bottlenecks: [], notes: '' }) as {
      bottlenecks: unknown[];
      notes: string;
    };
    return {
      summary: plan.summary,
      data: {
        kind: 'flag_kitchen_bottlenecks' as const,
        ...result,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

// Wired into the runtime registry from
//   supabase/functions/telegram-command-intake/index.ts (top-level call)
// — that's the Hepy bot Edge Function and the first dispatch site.
// Other Edge Functions that need ops intents must call this themselves
// on cold start (registerIntent is idempotent, duplicate calls are
// safe). Channel surfaces (slash commands, NL routing) for these intents
// land in a Sprint 14 follow-up; this PR ships the registry plumbing.
export function registerOpsAgentIntents(): void {
  registerIntent({
    name: 'ops.suggest_delivery_zones',
    agent: 'ops',
    defaultCategory: 'ops.read',
    description: 'Sugerează zone noi de livrare pe baza comenzilor din 30 de zile.',
    readOnly: true,
    handler: suggestDeliveryZonesHandler,
  });
  registerIntent({
    name: 'ops.optimize_courier_schedule',
    agent: 'ops',
    defaultCategory: 'ops.read',
    description: 'Propune program curieri pe baza istoricului 14 zile.',
    readOnly: true,
    handler: optimizeCourierScheduleHandler,
  });
  registerIntent({
    name: 'ops.flag_kitchen_bottlenecks',
    agent: 'ops',
    defaultCategory: 'ops.read',
    description: 'Identifică produsele care încetinesc fluxul (proxy 7 zile).',
    readOnly: true,
    handler: flagKitchenBottlenecksHandler,
  });
}

// Test-only export of internal refs.
export const __TESTING__ = {
  suggestDeliveryZonesHandler,
  optimizeCourierScheduleHandler,
  flagKitchenBottlenecksHandler,
  checkDailyCap,
  costUsdOf,
  validateZonesShape,
  validateScheduleShape,
  validateBottlenecksShape,
};
