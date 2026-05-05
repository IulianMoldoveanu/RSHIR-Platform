// HIR AI CEO — Phase 5 Growth Agent (daily)
//
// Triggered daily by GitHub Actions cron at 06:00 UTC. Iterates every
// active RESTAURANT tenant in mv_growth_tenant_metrics_30d, calls
// Sonnet 4.5 with prompt caching to produce 3-5 Romanian, operator-gated
// recommendations, persists them to growth_recommendations, and posts a
// digest to Iulian's Telegram. Cost is logged per call.
//
// Auth: shared secret in `X-Cron-Token` header.
//
// Required Edge Function secrets:
//   GROWTH_CRON_TOKEN          shared secret with GitHub Actions cron
//   ANTHROPIC_API_KEY          Anthropic API key
//   ANTHROPIC_MODEL_SONNET     model id (default claude-sonnet-4-5-20250929)
//   TELEGRAM_BOT_TOKEN         bot token for digest
//   TELEGRAM_IULIAN_CHAT_ID    chat id for digest
// Auto-injected:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const MIN_BENCHMARK_TENANTS = 3;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

type TenantMetrics = {
  tenant_id: string;
  tenant_slug: string;
  tenant_name: string;
  tenant_status: string;
  cuisine_types: string[] | unknown;
  orders_30d: number;
  cancels_30d: number;
  revenue_30d: number | string;
  aov_30d: number | string;
  avg_delivery_fee: number | string;
  unique_customers_30d: number;
  repeat_customers_30d: number;
  prior_orders_30d: number;
  prior_revenue_30d: number | string;
  orders_growth_pct: number | null;
  revenue_growth_pct: number | null;
  peak_hour: number | null;
  top_items: Array<{ item_id?: string; name?: string; qty?: number; revenue?: number | string }>;
  menu_item_count: number;
  menu_items_available: number;
  menu_items_no_image: number;
  reviews_count_30d: number;
  avg_rating_30d: number | string;
  low_ratings_30d: number;
  active_zones: number;
};

type CuisineBenchmark = {
  cuisine: string;
  tenant_count: number;
  avg_orders_30d: number | string;
  avg_revenue_30d: number | string;
  avg_aov_30d: number | string;
  avg_rating_30d: number | string;
  avg_repeat_rate_pct: number | string;
};

type Recommendation = {
  category:
    | 'menu_pricing'
    | 'menu_assortment'
    | 'operations'
    | 'marketing'
    | 'retention'
    | 'reviews'
    | 'delivery_zones'
    | 'reseller_pitch';
  priority: 'critical' | 'high' | 'medium' | 'low';
  title_ro: string;
  rationale_ro: string;
  suggested_action_ro: string;
  payload?: Record<string, unknown>;
};

const SYSTEM_PROMPT = [
  'Esti Growth Agent — un sub-agent al "Hepy" (AI CEO al HIR Restaurant Suite).',
  'Rol: analizezi ZILNIC metricile pe 30 de zile ale unui restaurant si propui',
  '3-5 recomandari concrete, prioritizate, in romana formala (foloseste',
  '"dumneavoastra"), pentru ca proprietarul sa creasca volum, retentie sau',
  'satisfactie.',
  '',
  'REGULI ABSOLUT OBLIGATORII:',
  '1. Toate textele tenant-facing sunt in ROMANA, formal ("dumneavoastra").',
  '2. NU folositi termenii "fleet", "flota", "subcontractor", "broker",',
  '   "carrier partner" — curierii sunt mereu "curier HIR" sau "echipa de',
  '   livrare HIR" pentru proprietar.',
  '3. NU pomeniti tarife sau abonamente in afara modelului HIR (3 RON / livrare',
  '   sau passthrough+3 RON). NU sugerati Wolt, Glovo, Tazz, FoodPanda ca',
  '   alternativa.',
  '4. Recomandarile sunt OPERATOR-GATED — proprietarul aproba inainte sa se',
  '   aplice. Formulati ca sugestii, nu ca actiuni deja realizate.',
  '5. Iesirea TREBUIE sa fie JSON strict, fara markdown, fara cod-fence.',
  '6. 3-5 recomandari, prioritizate. Fiecare are: category, priority,',
  '   title_ro (max 80 caractere), rationale_ro (max 280 caractere, citand',
  '   numere din metricile primite), suggested_action_ro (max 220 caractere,',
  '   cu pas concret) si payload (obiect, optional, gol daca nu e nevoie).',
  '7. Categorii permise: menu_pricing, menu_assortment, operations, marketing,',
  '   retention, reviews, delivery_zones, reseller_pitch.',
  '8. Prioritati permise: critical, high, medium, low. Maxim 1 critical pe',
  '   raport.',
  '9. Daca tenant-ul are 0 comenzi in 30 zile, focusati pe activare (marketing,',
  '   menu visibility, primii clienti).',
  '10. Daca exista benchmark de cuisine cu >=3 tenants, folositi-l comparativ',
  '    in rationale, dar NU dezvaluiti numere absolute ale altor tenants.',
  '',
  'FORMAT RASPUNS (JSON strict):',
  '{ "recommendations": [ { "category": "...", "priority": "...",',
  '  "title_ro": "...", "rationale_ro": "...", "suggested_action_ro": "...",',
  '  "payload": {} }, ... ] }',
].join('\n');

function buildUserPrompt(t: TenantMetrics, benchmarks: CuisineBenchmark[]): string {
  const cuisines = Array.isArray(t.cuisine_types) ? (t.cuisine_types as string[]) : [];
  const lines: string[] = [];
  lines.push(`Tenant: ${t.tenant_name} (slug: ${t.tenant_slug})`);
  lines.push(`Cuisine types: ${cuisines.length ? cuisines.join(', ') : 'nedefinite'}`);
  lines.push('');
  lines.push('METRICI ULTIMELE 30 ZILE:');
  lines.push(`- Comenzi (non-cancel): ${t.orders_30d} (anulari: ${t.cancels_30d})`);
  lines.push(`- Venit: ${Number(t.revenue_30d).toFixed(2)} RON`);
  lines.push(`- AOV (valoare medie comanda): ${Number(t.aov_30d).toFixed(2)} RON`);
  lines.push(`- Taxa medie livrare: ${Number(t.avg_delivery_fee).toFixed(2)} RON`);
  lines.push(`- Clienti unici: ${t.unique_customers_30d} (repetitivi: ${t.repeat_customers_30d})`);
  if (t.orders_growth_pct !== null && t.orders_growth_pct !== undefined) {
    lines.push(`- Crestere comenzi vs perioada anterioara 30 zile: ${t.orders_growth_pct}%`);
  } else {
    lines.push(`- Crestere comenzi vs perioada anterioara: N/A (no prior data)`);
  }
  if (t.revenue_growth_pct !== null && t.revenue_growth_pct !== undefined) {
    lines.push(`- Crestere venit vs perioada anterioara 30 zile: ${t.revenue_growth_pct}%`);
  }
  lines.push(`- Ora de varf: ${t.peak_hour ?? 'N/A'}`);
  lines.push('');
  lines.push('MENU:');
  lines.push(`- Total iteme: ${t.menu_item_count} (disponibile: ${t.menu_items_available})`);
  lines.push(`- Iteme fara imagine: ${t.menu_items_no_image}`);
  if (Array.isArray(t.top_items) && t.top_items.length > 0) {
    lines.push('- Top items (30 zile):');
    for (const it of t.top_items.slice(0, 5)) {
      lines.push(`  · ${it.name ?? 'N/A'}: ${it.qty ?? 0} buc, ${Number(it.revenue ?? 0).toFixed(2)} RON`);
    }
  } else {
    lines.push('- Top items: niciuna (no orders)');
  }
  lines.push('');
  lines.push('REVIEWS:');
  lines.push(`- Recenzii in 30 zile: ${t.reviews_count_30d}`);
  lines.push(`- Rating mediu: ${Number(t.avg_rating_30d).toFixed(2)} / 5`);
  lines.push(`- Recenzii cu rating <=3: ${t.low_ratings_30d}`);
  lines.push('');
  lines.push(`LIVRARE: ${t.active_zones} zone active de livrare.`);
  lines.push('');

  const relevant = benchmarks.filter((b) => cuisines.includes(b.cuisine));
  if (relevant.length > 0) {
    lines.push('BENCHMARK CUISINE (medii anonime, doar daca >=3 tenants):');
    for (const b of relevant) {
      lines.push(
        `- ${b.cuisine} (n=${b.tenant_count}): orders ${b.avg_orders_30d}, revenue ${b.avg_revenue_30d} RON, AOV ${b.avg_aov_30d} RON, repeat ${b.avg_repeat_rate_pct}%`,
      );
    }
  } else {
    lines.push('BENCHMARK CUISINE: insuficiente date peer (<3 tenants per cuisine).');
  }
  lines.push('');
  lines.push('Va rog sa generati 3-5 recomandari, in JSON strict, conform schemei.');
  return lines.join('\n');
}

async function callSonnet(
  apiKey: string,
  model: string,
  userMessage: string,
): Promise<{ recommendations: Recommendation[]; cost_usd: number; raw_usage: unknown }> {
  // Single retry on Anthropic 429 (rate limit) honoring `retry-after`. Without
  // this any tenant that hits a burst limit gets dropped from the daily digest;
  // with this we self-heal as soon as the bucket refills (max one retry to
  // stay well within Supabase Edge 150s wall-clock budget).
  let res!: Response;
  for (let attempt = 0; attempt < 2; attempt++) {
    res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    if (res.status !== 429 || attempt === 1) break;
    const retryAfterRaw = res.headers.get('retry-after') ?? '';
    const retryAfterSec = Number(retryAfterRaw);
    const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
      ? Math.min(retryAfterSec, 30) * 1000
      : 5_000;
    await new Promise((r) => setTimeout(r, waitMs));
  }
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

  let parsed: { recommendations: Recommendation[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`anthropic_unparseable_json: ${cleaned.slice(0, 200)}`);
  }
  if (!Array.isArray(parsed?.recommendations)) {
    throw new Error('anthropic_bad_shape: missing recommendations[]');
  }

  // Sonnet 4.5 pricing (per 1M tokens, USD):
  //   input $3.00, cache_write $3.75, cache_read $0.30, output $15.00
  const usage = data?.usage ?? {};
  const inTok = Number(usage.input_tokens ?? 0);
  const cacheWrite = Number(usage.cache_creation_input_tokens ?? 0);
  const cacheRead = Number(usage.cache_read_input_tokens ?? 0);
  const outTok = Number(usage.output_tokens ?? 0);
  const cost = (inTok * 3.0 + cacheWrite * 3.75 + cacheRead * 0.3 + outTok * 15.0) / 1_000_000;

  return { recommendations: parsed.recommendations, cost_usd: cost, raw_usage: usage };
}

const VALID_CATEGORIES = new Set([
  'menu_pricing',
  'menu_assortment',
  'operations',
  'marketing',
  'retention',
  'reviews',
  'delivery_zones',
  'reseller_pitch',
]);
const VALID_PRIORITIES = new Set(['critical', 'high', 'medium', 'low']);

function sanitize(rec: Recommendation): Recommendation | null {
  if (!VALID_CATEGORIES.has(rec.category)) return null;
  if (!VALID_PRIORITIES.has(rec.priority)) return null;
  if (!rec.title_ro || !rec.rationale_ro || !rec.suggested_action_ro) return null;
  const FORBIDDEN = /\b(fleet|flot[aă]|subcontractor|subcontracta(re|t)|broker|carrier partner)\b/i;
  if (
    FORBIDDEN.test(rec.title_ro) ||
    FORBIDDEN.test(rec.rationale_ro) ||
    FORBIDDEN.test(rec.suggested_action_ro)
  ) {
    console.warn('[growth-agent] forbidden term in recommendation, dropping');
    return null;
  }
  return {
    category: rec.category,
    priority: rec.priority,
    title_ro: rec.title_ro.slice(0, 200),
    rationale_ro: rec.rationale_ro.slice(0, 500),
    suggested_action_ro: rec.suggested_action_ro.slice(0, 500),
    payload: rec.payload && typeof rec.payload === 'object' ? rec.payload : {},
  };
}

async function persistRecommendations(
  supabase: SupabaseClient,
  tenantId: string,
  recs: Recommendation[],
  cost_usd: number,
  model: string,
): Promise<{ inserted: number }> {
  if (recs.length === 0) return { inserted: 0 };
  const rows = recs.map((r) => ({
    tenant_id: tenantId,
    category: r.category,
    priority: r.priority,
    title_ro: r.title_ro,
    rationale_ro: r.rationale_ro,
    suggested_action_ro: r.suggested_action_ro,
    payload: r.payload ?? {},
    auto_action_available: false, // Phase 5: operator-gated for ALL.
    status: 'pending' as const,
    cost_usd,
    model,
  }));
  const { error } = await supabase.from('growth_recommendations').insert(rows);
  if (error) {
    console.error('[growth-agent] insert failed:', error.message);
    throw new Error(`insert_failed: ${error.message}`);
  }
  return { inserted: rows.length };
}

async function postTelegramDigest(
  token: string,
  chatId: string,
  summary: {
    tenants_processed: number;
    recommendations_total: number;
    cost_usd_total: number;
    sample: Array<{ tenant_name: string; priority: string; title_ro: string }>;
    errors: number;
  },
): Promise<{ messageId: number | null; ok: boolean }> {
  const lines: string[] = [];
  lines.push('🤖 *Growth Agent — raport zilnic*');
  lines.push('');
  lines.push(`Tenants procesati: *${summary.tenants_processed}*`);
  lines.push(`Recomandari emise: *${summary.recommendations_total}*`);
  lines.push(`Cost total Sonnet 4.5: *$${summary.cost_usd_total.toFixed(4)}*`);
  if (summary.errors > 0) lines.push(`⚠️ Erori per tenant: ${summary.errors}`);
  if (summary.sample.length > 0) {
    lines.push('');
    lines.push('*Sample recomandari:*');
    for (const s of summary.sample.slice(0, 6)) {
      const emoji =
        s.priority === 'critical' ? '🔴' : s.priority === 'high' ? '🟠' : s.priority === 'medium' ? '🟡' : '⚪️';
      lines.push(`${emoji} ${s.tenant_name}: ${s.title_ro}`);
    }
  }
  lines.push('');
  lines.push('Toate sunt _operator-gated_ — proprietarul aproba.');

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: lines.join('\n'),
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    console.error('[growth-agent] telegram failed:', await res.text());
    return { messageId: null, ok: false };
  }
  const data = await res.json();
  return { messageId: data?.result?.message_id ?? null, ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    return json(200, { ok: true, service: 'growth-agent-daily', model: DEFAULT_MODEL });
  }
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const expected = Deno.env.get('GROWTH_CRON_TOKEN');
  if (!expected) return json(500, { error: 'cron_secret_missing' });
  const got = req.headers.get('x-cron-token') ?? '';
  if (got !== expected) return json(401, { error: 'unauthorized' });

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json(500, { error: 'anthropic_env_missing' });
  const model = Deno.env.get('ANTHROPIC_MODEL_SONNET') ?? DEFAULT_MODEL;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: { tenant_id?: string } = {};
  try {
    body = (await req.json()) as { tenant_id?: string };
  } catch {
    body = {};
  }

  const metricsQuery = supabase.from('mv_growth_tenant_metrics_30d').select('*');
  const { data: metricsData, error: metricsErr } = body.tenant_id
    ? await metricsQuery.eq('tenant_id', body.tenant_id)
    : await metricsQuery;
  if (metricsErr) return json(500, { error: 'metrics_fetch_failed', detail: metricsErr.message });
  const tenants = (metricsData ?? []) as TenantMetrics[];

  const { data: benchData, error: benchErr } = await supabase
    .from('v_growth_cuisine_benchmark')
    .select('*');
  if (benchErr) {
    console.warn('[growth-agent] benchmark fetch failed:', benchErr.message);
  }
  const benchmarks = ((benchData ?? []) as CuisineBenchmark[]).filter(
    (b) => Number(b.tenant_count) >= MIN_BENCHMARK_TENANTS,
  );

  let totalRecs = 0;
  let totalCost = 0;
  let errorCount = 0;
  const sample: Array<{ tenant_name: string; priority: string; title_ro: string }> = [];
  const perTenant: Array<{
    tenant_id: string;
    tenant_slug: string;
    recommendations: Recommendation[];
    cost_usd: number;
    error?: string;
  }> = [];

  // Process tenants in bounded-concurrency batches. Serial loop hit Supabase
  // Edge 150s wall-clock cap once we passed ~5 tenants (HTTP 503 since
  // 2026-05-04). Unbounded fan-out would exceed Anthropic Tier-1 RPM (~50)
  // as we onboard reseller tenants. Batch size of 4 keeps total wall-clock
  // ~= ceil(N/4) * single-call latency (~30s) and stays under burst limits.
  const CONCURRENCY = 4;
  const processTenant = async (t: TenantMetrics): Promise<void> => {
    try {
      const userPrompt = buildUserPrompt(t, benchmarks);
      const { recommendations, cost_usd } = await callSonnet(apiKey, model, userPrompt);
      const cleaned = recommendations.map(sanitize).filter((r): r is Recommendation => r !== null);
      let crits = 0;
      const final = cleaned.map((r) => {
        if (r.priority === 'critical') {
          crits += 1;
          if (crits > 1) return { ...r, priority: 'high' as const };
        }
        return r;
      });
      const { inserted } = await persistRecommendations(supabase, t.tenant_id, final, cost_usd, model);
      totalRecs += inserted;
      totalCost += cost_usd;
      perTenant.push({
        tenant_id: t.tenant_id,
        tenant_slug: t.tenant_slug,
        recommendations: final,
        cost_usd,
      });
      for (const r of final.slice(0, 1)) {
        sample.push({ tenant_name: t.tenant_name, priority: r.priority, title_ro: r.title_ro });
      }
    } catch (e) {
      errorCount += 1;
      const detail = (e as Error).message;
      console.error(`[growth-agent] tenant ${t.tenant_slug} failed:`, detail);
      perTenant.push({
        tenant_id: t.tenant_id,
        tenant_slug: t.tenant_slug,
        recommendations: [],
        cost_usd: 0,
        error: detail,
      });
    }
  };
  for (let i = 0; i < tenants.length; i += CONCURRENCY) {
    const batch = tenants.slice(i, i + CONCURRENCY);
    await Promise.allSettled(batch.map(processTenant));
  }

  const tgToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const tgChat = Deno.env.get('TELEGRAM_IULIAN_CHAT_ID');
  let telegramMessageId: number | null = null;
  if (tgToken && tgChat) {
    const tg = await postTelegramDigest(tgToken, tgChat, {
      tenants_processed: tenants.length,
      recommendations_total: totalRecs,
      cost_usd_total: totalCost,
      sample,
      errors: errorCount,
    });
    telegramMessageId = tg.messageId;
  }

  return json(200, {
    ok: true,
    tenants_processed: tenants.length,
    recommendations_total: totalRecs,
    errors: errorCount,
    cost_usd_total: Number(totalCost.toFixed(6)),
    telegram_message_id: telegramMessageId,
    per_tenant: perTenant,
    model,
  });
});
