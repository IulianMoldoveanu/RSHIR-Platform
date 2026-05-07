// Analytics Agent intents — handlers for the Master Orchestrator.
//
// Lane GO Option A (2026-05-08): wire the four already-registered analytics
// intent stubs in `master-orchestrator.ts` to real two-phase plan/execute
// handlers, plus add one new intent `analytics.explain_anomaly` (Sonnet 4.5).
//
// All 5 intents are read-only relative to tenant data (they only read
// orders / recommendations / weather / audit and never mutate them). They
// still write a row to `copilot_agent_runs` via the dispatcher's ledger
// so usage is auditable. `readOnly: true` bypasses the trust gate.
//
// Sources of truth (all already shipped):
//   - mv_growth_tenant_metrics_30d   (per-tenant 30-day rollup)
//   - restaurant_orders              (live order stream)
//   - growth_recommendations         (Growth Agent daily output)
//   - weather_snapshots              (per-city OpenWeatherMap snapshots)
//   - audit_log                      (tenant action log; menu changes filter)
//   - copilot_agent_runs             (dispatcher ledger; per-day cap source)
//
// Cap pattern for `analytics.explain_anomaly`: count rows in
// `copilot_agent_runs` with action_type='analytics.explain_anomaly.read' for
// the same tenant on the same UTC day. >=5 → return cap-exceeded message
// without calling Anthropic.

import {
  registerIntent,
  type HandlerContext,
  type IntentHandler,
} from './master-orchestrator.ts';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type Period = 'today' | 'yesterday' | 'week' | 'month';

type PeriodWindow = {
  from: Date;
  to: Date;
  label: string;
  prevFrom: Date;
  prevTo: Date;
};

function periodWindow(p: Period): PeriodWindow {
  const now = new Date();
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  if (p === 'today') {
    return {
      from: startOfToday,
      to: now,
      label: 'azi',
      prevFrom: new Date(startOfToday.getTime() - 24 * 3600 * 1000),
      prevTo: startOfToday,
    };
  }
  if (p === 'yesterday') {
    const from = new Date(startOfToday.getTime() - 24 * 3600 * 1000);
    return {
      from,
      to: startOfToday,
      label: 'ieri',
      prevFrom: new Date(from.getTime() - 24 * 3600 * 1000),
      prevTo: from,
    };
  }
  if (p === 'week') {
    const from = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    return {
      from,
      to: now,
      label: 'ultimele 7 zile',
      prevFrom: new Date(from.getTime() - 7 * 24 * 3600 * 1000),
      prevTo: from,
    };
  }
  const from = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  return {
    from,
    to: now,
    label: 'ultimele 30 de zile',
    prevFrom: new Date(from.getTime() - 30 * 24 * 3600 * 1000),
    prevTo: from,
  };
}

function fmtRon(n: number): string {
  return (
    n.toLocaleString('ro-RO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' RON'
  );
}

function deltaPct(curr: number, prev: number): string {
  if (prev <= 0) return curr > 0 ? '(perioada anterioară 0)' : '';
  const pct = ((curr - prev) / prev) * 100;
  const sign = pct >= 0 ? '+' : '';
  const arrow = pct >= 0 ? '▲' : '▼';
  return `${arrow} ${sign}${pct.toFixed(1)}% vs. perioada anterioară`;
}

function readPeriod(payload: Record<string, unknown>, fallback: Period): Period {
  const raw = String(payload.period ?? fallback).toLowerCase();
  return raw === 'today' || raw === 'yesterday' || raw === 'week' || raw === 'month'
    ? raw
    : fallback;
}

function isRevenueStatus(s: string): boolean {
  return s !== 'CANCELLED';
}

type OrderRow = {
  total_ron: number | string | null;
  status: string;
  items?: unknown;
  created_at?: string;
};

function aggregateItems(
  rows: OrderRow[],
): Record<string, { qty: number; revenue: number }> {
  const counts: Record<string, { qty: number; revenue: number }> = {};
  for (const o of rows) {
    if (!isRevenueStatus(o.status)) continue;
    const items = Array.isArray(o.items) ? (o.items as Array<Record<string, unknown>>) : [];
    for (const it of items) {
      const name =
        typeof it?.name === 'string'
          ? (it.name as string)
          : typeof it?.title === 'string'
            ? (it.title as string)
            : null;
      if (!name) continue;
      const qty = Number(it?.quantity ?? it?.qty ?? 1);
      const lineTotal = Number(it?.lineTotalRon ?? it?.line_total_ron ?? NaN);
      const unitPrice = Number(
        it?.priceRon ?? it?.price_ron ?? it?.unit_price ?? it?.price ?? 0,
      );
      const revenue = Number.isFinite(lineTotal) ? lineTotal : qty * unitPrice;
      if (!counts[name]) counts[name] = { qty: 0, revenue: 0 };
      counts[name].qty += qty;
      counts[name].revenue += revenue;
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// 1. analytics.summary
// ---------------------------------------------------------------------------

const summaryHandler: IntentHandler = {
  plan: async (_ctx, payload) => {
    const period = readPeriod(payload, 'today');
    return {
      actionCategory: 'analytics.read',
      summary: `Sumar comenzi/încasări (${period}).`,
      resolvedPayload: { period },
    };
  },
  execute: async (ctx, plan) => {
    const period = (plan.resolvedPayload?.period as Period) ?? 'today';
    const win = periodWindow(period);
    const { data: curr } = await ctx.supabase
      .from('restaurant_orders')
      .select('total_ron, status, items, created_at')
      .eq('tenant_id', ctx.tenantId)
      .gte('created_at', win.from.toISOString())
      .lt('created_at', win.to.toISOString());
    const { data: prev } = await ctx.supabase
      .from('restaurant_orders')
      .select('total_ron, status')
      .eq('tenant_id', ctx.tenantId)
      .gte('created_at', win.prevFrom.toISOString())
      .lt('created_at', win.prevTo.toISOString());

    const currRows = (curr ?? []) as OrderRow[];
    const prevRows = (prev ?? []) as OrderRow[];

    const totalCurr = currRows.filter((o) => isRevenueStatus(o.status)).length;
    const revenueCurr = currRows
      .filter((o) => isRevenueStatus(o.status))
      .reduce((a, o) => a + Number(o.total_ron || 0), 0);
    const cancelledCurr = currRows.filter((o) => o.status === 'CANCELLED').length;
    const totalPrev = prevRows.filter((o) => isRevenueStatus(o.status)).length;
    const revenuePrev = prevRows
      .filter((o) => isRevenueStatus(o.status))
      .reduce((a, o) => a + Number(o.total_ron || 0), 0);

    const counts = aggregateItems(currRows);
    const top3 = Object.entries(counts)
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 3)
      .map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }));

    return {
      summary: `Sumar ${win.label}: ${totalCurr} comenzi, ${fmtRon(revenueCurr)}.`,
      data: {
        period,
        label: win.label,
        orders: totalCurr,
        revenue_ron: revenueCurr,
        cancelled: cancelledCurr,
        orders_delta: deltaPct(totalCurr, totalPrev),
        revenue_delta: deltaPct(revenueCurr, revenuePrev),
        top_products: top3,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 2. analytics.top_products
// ---------------------------------------------------------------------------

const topProductsHandler: IntentHandler = {
  plan: async (_ctx, payload) => {
    const period = readPeriod(payload, 'week');
    const limit = Math.min(20, Math.max(1, Number(payload.limit ?? 10)));
    return {
      actionCategory: 'analytics.read',
      summary: `Top ${limit} produse (${period}).`,
      resolvedPayload: { period, limit },
    };
  },
  execute: async (ctx, plan) => {
    const period = (plan.resolvedPayload?.period as Period) ?? 'week';
    const limit = Number(plan.resolvedPayload?.limit ?? 10);
    const win = periodWindow(period);
    const { data: curr } = await ctx.supabase
      .from('restaurant_orders')
      .select('items, status')
      .eq('tenant_id', ctx.tenantId)
      .gte('created_at', win.from.toISOString())
      .lt('created_at', win.to.toISOString());
    const counts = aggregateItems((curr ?? []) as OrderRow[]);
    const top = Object.entries(counts)
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, limit)
      .map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }));
    return {
      summary: `Top ${top.length} produse pentru ${win.label}.`,
      data: { period, label: win.label, products: top },
    };
  },
};

// ---------------------------------------------------------------------------
// 3. analytics.recommendations_today
// ---------------------------------------------------------------------------

const recommendationsTodayHandler: IntentHandler = {
  plan: async (_ctx, payload) => {
    const days = Math.min(30, Math.max(1, Number(payload.days ?? 7)));
    return {
      actionCategory: 'analytics.read',
      summary: `Recomandări (ultimele ${days} zile).`,
      resolvedPayload: { days },
    };
  },
  execute: async (ctx, plan) => {
    const days = Number(plan.resolvedPayload?.days ?? 7);
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    const { data: recs } = await ctx.supabase
      .from('growth_recommendations')
      .select(
        'priority, category, title_ro, rationale_ro, suggested_action_ro, status, generated_at',
      )
      .eq('tenant_id', ctx.tenantId)
      .gte('generated_at', since)
      .order('generated_at', { ascending: false })
      .limit(10);
    const list = (recs ?? []) as Array<{
      priority: string;
      category: string;
      title_ro: string;
      rationale_ro: string;
      suggested_action_ro: string;
      status: string;
      generated_at: string;
    }>;
    return {
      summary:
        list.length === 0
          ? `Nicio recomandare nouă în ultimele ${days} zile.`
          : `${list.length} recomandări în ultimele ${days} zile.`,
      data: { days, recommendations: list },
    };
  },
};

// ---------------------------------------------------------------------------
// 4. analytics.report — combined daily + weekly view
// ---------------------------------------------------------------------------

const reportHandler: IntentHandler = {
  plan: async () => ({
    actionCategory: 'analytics.read',
    summary: 'Raport zilnic + săptămânal.',
    resolvedPayload: {},
  }),
  execute: async (ctx) => {
    const today = await summaryHandler.execute(ctx, {
      actionCategory: 'analytics.read',
      summary: '',
      resolvedPayload: { period: 'today' },
    });
    const week = await topProductsHandler.execute(ctx, {
      actionCategory: 'analytics.read',
      summary: '',
      resolvedPayload: { period: 'week', limit: 5 },
    });
    const recs = await recommendationsTodayHandler.execute(ctx, {
      actionCategory: 'analytics.read',
      summary: '',
      resolvedPayload: { days: 7 },
    });
    return {
      summary: 'Raport: azi + top 5 săpt. + recomandări 7z.',
      data: {
        today: today.data,
        top_products_week: week.data,
        recommendations_7d: recs.data,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 5. analytics.explain_anomaly — Sonnet 4.5
// ---------------------------------------------------------------------------
// Inputs: { metric: 'orders'|'revenue'|'aov', dateRange: 'today'|'week' (default 'today') }
// Output: 2-3 hypothesis-ranked explanations as bullet strings.
// Cross-reference: weather_snapshots (current city), recent menu changes
// (audit_log filtered to action LIKE '%menu%'), day-of-week baseline from
// mv_growth_tenant_metrics_30d.
//
// Per-day cap: 5 invocations per tenant per UTC day, counted from
// copilot_agent_runs WHERE action_type='analytics.explain_anomaly.read'.
// Cap exceeded → return short message, NO Anthropic call.

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const DAILY_CAP = 5;

type ExplainMetric = 'orders' | 'revenue' | 'aov';

const EXPLAIN_SYSTEM_PROMPT = [
  'Esti Analytics Agent — un sub-agent al "Hepy" (AI CEO HIR Restaurant Suite).',
  'Rol: explici, in 2-3 ipoteze ordonate dupa probabilitate, de ce o cifra a',
  'tenantului a crescut sau a scazut.',
  '',
  'REGULI ABSOLUT OBLIGATORII:',
  '1. Iesirea TREBUIE sa fie JSON strict, fara markdown, fara cod-fence.',
  '2. Forma: {"hypotheses":[{"rank":1,"text":"..."},{"rank":2,"text":"..."}]}.',
  '3. 2-3 ipoteze. Fiecare ipoteza max 200 caractere. Romana formala ("dumneavoastra").',
  '4. NU folositi termenii "fleet", "flota", "subcontractor", "broker",',
  '   "carrier partner". Curierii sunt "curier HIR".',
  '5. Citati numere concrete din contextul primit (vreme, modificari de meniu,',
  '   baseline ziua saptamanii) — fara cifre inventate.',
  '6. Daca contextul nu permite o ipoteza credibila, spuneti explicit',
  '   "Date insuficiente pentru o concluzie." si reduceti la 1-2 ipoteze.',
].join('\n');

async function countTodayInvocations(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  tenantId: string,
): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from('copilot_agent_runs')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', tenantId)
    .eq('action_type', 'analytics.explain_anomaly.read')
    .gte('created_at', startOfDay.toISOString());
  if (error) return 0; // fail-open: don't block on a count failure
  return Number(count ?? 0);
}

async function fetchExplainContext(
  ctx: HandlerContext,
  metric: ExplainMetric,
): Promise<{
  current_value: number;
  baseline_value: number;
  baseline_label: string;
  weather: { temp_c?: number; main?: string; desc?: string } | null;
  recent_menu_changes: Array<{ action: string; entity_id?: string; created_at: string }>;
}> {
  // Day-of-week baseline: average of (orders_30d / 30) from MV. Cheap, sufficient.
  const { data: mv } = await ctx.supabase
    .from('mv_growth_tenant_metrics_30d')
    .select('orders_30d, revenue_30d, aov_30d')
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  // Today's value for the requested metric.
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const { data: todayRows } = await ctx.supabase
    .from('restaurant_orders')
    .select('total_ron, status')
    .eq('tenant_id', ctx.tenantId)
    .gte('created_at', startOfToday.toISOString());
  const today = ((todayRows ?? []) as OrderRow[]).filter((o) => isRevenueStatus(o.status));
  const todayOrders = today.length;
  const todayRevenue = today.reduce((a, o) => a + Number(o.total_ron || 0), 0);
  const todayAov = todayOrders > 0 ? todayRevenue / todayOrders : 0;

  let current_value = 0;
  let baseline_value = 0;
  if (metric === 'orders') {
    current_value = todayOrders;
    baseline_value = Number(mv?.orders_30d ?? 0) / 30;
  } else if (metric === 'revenue') {
    current_value = todayRevenue;
    baseline_value = Number(mv?.revenue_30d ?? 0) / 30;
  } else {
    current_value = todayAov;
    baseline_value = Number(mv?.aov_30d ?? 0);
  }

  // Weather: latest snapshot for the tenant's city (if linked).
  const { data: tenantRow } = await ctx.supabase
    .from('tenants')
    .select('city_id')
    .eq('id', ctx.tenantId)
    .maybeSingle();
  let weather: { temp_c?: number; main?: string; desc?: string } | null = null;
  if (tenantRow?.city_id) {
    const { data: ws } = await ctx.supabase
      .from('weather_snapshots')
      .select('temp_c, weather_main, weather_desc')
      .eq('city_id', tenantRow.city_id)
      .order('snapshot_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ws) {
      weather = {
        temp_c: ws.temp_c == null ? undefined : Number(ws.temp_c),
        main: ws.weather_main ?? undefined,
        desc: ws.weather_desc ?? undefined,
      };
    }
  }

  // Recent menu changes — last 7 days, audit_log actions matching menu/item/price.
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: audit } = await ctx.supabase
    .from('audit_log')
    .select('action, entity_id, created_at')
    .eq('tenant_id', ctx.tenantId)
    .gte('created_at', since)
    .or('action.ilike.%menu%,action.ilike.%item%,action.ilike.%price%')
    .order('created_at', { ascending: false })
    .limit(10);

  return {
    current_value,
    baseline_value,
    baseline_label: 'medie 30 de zile',
    weather,
    recent_menu_changes: (audit ?? []) as Array<{
      action: string;
      entity_id?: string;
      created_at: string;
    }>,
  };
}

const explainAnomalyHandler: IntentHandler = {
  plan: async (_ctx, payload) => {
    const metric = String(payload.metric ?? 'orders').toLowerCase();
    const validMetric: ExplainMetric =
      metric === 'orders' || metric === 'revenue' || metric === 'aov' ? metric : 'orders';
    const dateRange = String(payload.dateRange ?? 'today').toLowerCase();
    const validRange = dateRange === 'week' ? 'week' : 'today';
    return {
      actionCategory: 'analytics.explain_anomaly.read',
      summary: `Explică ${validMetric} (${validRange}).`,
      resolvedPayload: { metric: validMetric, dateRange: validRange },
    };
  },
  execute: async (ctx, plan) => {
    const metric = plan.resolvedPayload?.metric as ExplainMetric;

    // 1. Daily cap check.
    const used = await countTodayInvocations(ctx.supabase, ctx.tenantId);
    if (used >= DAILY_CAP) {
      return {
        summary: `Limită zilnică atinsă (${DAILY_CAP} explicații/zi).`,
        data: {
          metric,
          capped: true,
          hypotheses: [
            {
              rank: 1,
              text: `Ați folosit cele ${DAILY_CAP} explicații zilnice. Reveniți mâine sau consultați raportul complet din /dashboard/analytics.`,
            },
          ],
        },
      };
    }

    // 2. Gather context.
    const context = await fetchExplainContext(ctx, metric);

    // 3. Anthropic call. ANTHROPIC_API_KEY required (same env var as Growth Agent).
    const apiKey = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } })
      .Deno?.env.get('ANTHROPIC_API_KEY');
    const model =
      (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(
        'ANTHROPIC_MODEL_SONNET',
      ) ?? DEFAULT_MODEL;

    if (!apiKey) {
      return {
        summary: 'Anthropic neconfigurat.',
        data: {
          metric,
          capped: false,
          hypotheses: [
            {
              rank: 1,
              text: 'Asistentul AI nu este configurat. Contactați platforma pentru a-l activa.',
            },
          ],
        },
      };
    }

    const formattedCurrent =
      metric === 'revenue' ? fmtRon(context.current_value) : context.current_value.toFixed(2);
    const formattedBaseline =
      metric === 'revenue' ? fmtRon(context.baseline_value) : context.baseline_value.toFixed(2);
    const userPrompt = [
      `Metric: ${metric}`,
      `Valoare curenta (azi): ${formattedCurrent}`,
      `Baseline (${context.baseline_label}): ${formattedBaseline}`,
      `Vreme curenta: ${
        context.weather
          ? `${context.weather.main ?? '?'} (${context.weather.desc ?? '-'}), ${
              context.weather.temp_c ?? '?'
            }°C`
          : 'indisponibila'
      }`,
      `Modificari meniu recente (max 10, ultimele 7 zile): ${
        context.recent_menu_changes.length === 0
          ? 'niciuna'
          : context.recent_menu_changes
              .map((m) => `${m.action} la ${m.created_at.slice(0, 10)}`)
              .join('; ')
      }`,
      '',
      'Explicati cu 2-3 ipoteze ordonate dupa probabilitate.',
    ].join('\n');

    let res: Response;
    try {
      res = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 600,
          system: [
            { type: 'text', text: EXPLAIN_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
          ],
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        summary: 'Eroare apel Anthropic.',
        data: {
          metric,
          capped: false,
          error: msg,
          hypotheses: [
            { rank: 1, text: 'Asistentul AI este indisponibil momentan. Reîncercați mai târziu.' },
          ],
        },
      };
    }
    if (!res.ok) {
      const errText = (await res.text()).slice(0, 200);
      return {
        summary: `Anthropic ${res.status}.`,
        data: {
          metric,
          capped: false,
          error: errText,
          hypotheses: [
            { rank: 1, text: 'Asistentul AI este indisponibil momentan. Reîncercați mai târziu.' },
          ],
        },
      };
    }
    const data = (await res.json()) as {
      content?: Array<{ type: string; text: string }>;
      usage?: Record<string, number>;
    };
    const text =
      Array.isArray(data?.content) && data.content[0]?.type === 'text'
        ? data.content[0].text
        : '';
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    let parsed: { hypotheses: Array<{ rank: number; text: string }> };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return {
        summary: 'Răspuns AI inutilizabil.',
        data: {
          metric,
          capped: false,
          hypotheses: [{ rank: 1, text: 'Răspunsul asistentului AI nu a putut fi interpretat.' }],
        },
      };
    }
    if (!Array.isArray(parsed?.hypotheses)) {
      return {
        summary: 'Format AI invalid.',
        data: {
          metric,
          capped: false,
          hypotheses: [{ rank: 1, text: 'Răspunsul asistentului AI a avut o formă neașteptată.' }],
        },
      };
    }

    const usage = data.usage ?? {};
    const inTok = Number(usage.input_tokens ?? 0);
    const cacheWrite = Number(usage.cache_creation_input_tokens ?? 0);
    const cacheRead = Number(usage.cache_read_input_tokens ?? 0);
    const outTok = Number(usage.output_tokens ?? 0);
    const cost = (inTok * 3.0 + cacheWrite * 3.75 + cacheRead * 0.3 + outTok * 15.0) / 1_000_000;

    return {
      summary: `${parsed.hypotheses.length} ipoteze · $${cost.toFixed(4)}.`,
      data: {
        metric,
        capped: false,
        hypotheses: parsed.hypotheses.slice(0, 3),
        cost_usd: cost,
        used_today: used + 1,
        cap_per_day: DAILY_CAP,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Registration entry point — called once per Edge Function invocation.
// Idempotent: registerIntent ignores re-registration (logs a warn).
// ---------------------------------------------------------------------------

let REGISTERED = false;

export function registerAnalyticsIntents(): void {
  if (REGISTERED) return;
  registerIntent({
    name: 'analytics.summary',
    agent: 'analytics',
    defaultCategory: 'analytics.read',
    readOnly: true,
    description: 'Sumar comenzi/încasări pentru o perioadă.',
    handler: summaryHandler,
  });
  registerIntent({
    name: 'analytics.top_products',
    agent: 'analytics',
    defaultCategory: 'analytics.read',
    readOnly: true,
    description: 'Top produse vândute pentru o perioadă.',
    handler: topProductsHandler,
  });
  registerIntent({
    name: 'analytics.recommendations_today',
    agent: 'analytics',
    defaultCategory: 'analytics.read',
    readOnly: true,
    description: 'Ultimele recomandări de creștere pentru tenant.',
    handler: recommendationsTodayHandler,
  });
  registerIntent({
    name: 'analytics.report',
    agent: 'analytics',
    defaultCategory: 'analytics.read',
    readOnly: true,
    description: 'Raport zilnic compact (orders + sales + low_stock).',
    handler: reportHandler,
  });
  registerIntent({
    name: 'analytics.explain_anomaly',
    agent: 'analytics',
    defaultCategory: 'analytics.explain_anomaly.read',
    readOnly: true,
    description: 'Explică o cifră (orders/revenue/aov) cu 2-3 ipoteze.',
    handler: explainAnomalyHandler,
  });
  REGISTERED = true;
}

// Test-only helpers.
export function __resetForTesting(): void {
  REGISTERED = false;
}

export const __testHelpers = {
  periodWindow,
  fmtRon,
  deltaPct,
  aggregateItems,
  summaryHandler,
  topProductsHandler,
  recommendationsTodayHandler,
  reportHandler,
  explainAnomalyHandler,
};
