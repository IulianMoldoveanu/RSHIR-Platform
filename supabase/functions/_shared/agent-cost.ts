// HIR F6 — Agent Cost Ledger helper.
//
// Two surface functions:
//   recordCost(...)  — insert a row in `agent_cost_ledger` with cost_cents
//                      derived from a static pricing table. Safe to call from
//                      anywhere (no throws — failures are logged).
//   checkBudget(t)   — returns the tenant's current-month spend vs the
//                      monthly budget on `tenants.settings.ai.monthly_budget_cents`.
//
// Both honour the `COST_LEDGER_ENABLED` feature flag. When false:
//   recordCost  → no-op
//   checkBudget → always returns { ok: true, used: 0, limit: Infinity }
//
// Mock-first: when ANTHROPIC_API_KEY is absent, callers will typically pass
// inputTokens=0 / outputTokens=0 (no real call happened). This helper does
// NOT fabricate usage — cost_cents will be 0 in that case, by design.
//
// Pricing table is intentionally a constant in this file. Anthropic prices
// change rarely; when they do, update here. Per-MTok rates in USD:
//   claude-sonnet-4-5     : $3   in / $15  out
//   claude-haiku-4-5      : $0.80 in / $4  out
//   text-embedding-3-small: $0.02 / MTok (input only — OpenAI embeddings have
//                                          no output tokens)
//
// Cents are stored as numeric(10,4) so we do NOT round here; we keep the
// fractional precision the DB column supports.

export type RecordCostInput = {
  tenantId: string;
  agentName: string;
  // Optional — most agent calls dispatch through the orchestrator and have a
  // copilot_agent_runs row; cron jobs without an orchestrator dispatch pass
  // null/undefined.
  runId?: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export type BudgetStatus = {
  ok: boolean;
  used: number;   // cents
  limit: number;  // cents (Infinity when ledger disabled or no budget set)
};

// USD per million tokens. Match strings against startsWith() so the dated
// model suffix (e.g. `-20250929`) does NOT break pricing.
const PRICING: Array<{
  prefix: string;
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
}> = [
  { prefix: 'claude-sonnet-4-5', inputUsdPerMTok: 3.0,  outputUsdPerMTok: 15.0 },
  { prefix: 'claude-haiku-4-5',  inputUsdPerMTok: 0.8,  outputUsdPerMTok: 4.0  },
  // OpenAI text-embedding-3-small — input-only.
  { prefix: 'text-embedding-3-small', inputUsdPerMTok: 0.02, outputUsdPerMTok: 0 },
];

const DEFAULT_MONTHLY_BUDGET_CENTS = 5000; // $50 / tenant / month

function ledgerEnabled(): boolean {
  // Default ON; set COST_LEDGER_ENABLED=false to disable. Reading from
  // Deno.env keeps this Edge-Function compatible; in Node test envs the
  // global may be undefined → treat as enabled.
  // deno-lint-ignore no-explicit-any
  const env: any = (globalThis as any).Deno?.env;
  const v = env ? env.get('COST_LEDGER_ENABLED') : (globalThis as any).process?.env?.COST_LEDGER_ENABLED;
  if (v == null) return true;
  return String(v).toLowerCase() !== 'false';
}

/**
 * Compute cost in cents for a given (model, input_tokens, output_tokens).
 * Exported for unit tests. Unknown models → 0 (logged, not thrown).
 */
export function computeCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  if (!model) return 0;
  const row = PRICING.find((p) => model.startsWith(p.prefix));
  if (!row) {
    console.warn(`[agent-cost] unknown model "${model}" — cost recorded as 0`);
    return 0;
  }
  const inCents  = (inputTokens  / 1_000_000) * row.inputUsdPerMTok  * 100;
  const outCents = (outputTokens / 1_000_000) * row.outputUsdPerMTok * 100;
  return inCents + outCents;
}

/**
 * Insert a single ledger row. Best-effort: errors are logged but never
 * thrown to the caller, because the cost ledger MUST NEVER fail an agent's
 * primary work (e.g. responding to a user). If the ledger is disabled by
 * feature flag, this is a no-op.
 */
export async function recordCost(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  input: RecordCostInput,
): Promise<void> {
  if (!ledgerEnabled()) return;
  const cost_cents = computeCostCents(input.model, input.inputTokens, input.outputTokens);
  try {
    const { error } = await supabase.from('agent_cost_ledger').insert({
      tenant_id: input.tenantId,
      agent_name: input.agentName,
      run_id: input.runId ?? null,
      model: input.model,
      input_tokens: Math.max(0, Math.floor(input.inputTokens || 0)),
      output_tokens: Math.max(0, Math.floor(input.outputTokens || 0)),
      cost_cents,
    });
    if (error) {
      console.warn('[agent-cost] insert failed:', error.message);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[agent-cost] insert threw:', msg);
  }
}

/**
 * Returns the tenant's current-calendar-month spend vs the monthly budget
 * stored in `tenants.settings.ai.monthly_budget_cents` (default $50).
 * `ok: false` means the tenant has exceeded budget.
 *
 * The dispatcher uses this BEFORE plan() to decide whether to short-circuit
 * an expensive intent. `master` agent calls are always allowed (the master
 * orchestrator itself must keep working so an OWNER can still see proposals
 * and inspect the system).
 */
export async function checkBudget(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tenantId: string,
): Promise<BudgetStatus> {
  if (!ledgerEnabled()) {
    return { ok: true, used: 0, limit: Number.POSITIVE_INFINITY };
  }

  // Resolve budget. Default $50 / month if settings.ai.monthly_budget_cents
  // is absent or invalid.
  let limit = DEFAULT_MONTHLY_BUDGET_CENTS;
  try {
    const { data } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .maybeSingle();
    const cents = (data?.settings as Record<string, unknown> | null)?.ai;
    const raw = cents && typeof cents === 'object'
      ? (cents as Record<string, unknown>).monthly_budget_cents
      : undefined;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
      limit = raw;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[agent-cost] checkBudget settings read failed:', msg);
  }

  // Sum current-month spend.
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  let used = 0;
  try {
    const { data, error } = await supabase
      .from('agent_cost_ledger')
      .select('cost_cents')
      .eq('tenant_id', tenantId)
      .gte('created_at', monthStart.toISOString());
    if (error) {
      console.warn('[agent-cost] checkBudget sum failed:', error.message);
    } else if (Array.isArray(data)) {
      for (const row of data) {
        const v = Number((row as { cost_cents?: number | string }).cost_cents ?? 0);
        if (Number.isFinite(v)) used += v;
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[agent-cost] checkBudget query threw:', msg);
  }

  return { ok: used < limit, used, limit };
}

/**
 * Extract input/output tokens from an Anthropic v1/messages response body.
 * Returns zeros if either field is missing — caller decides whether that's
 * a no-call or an unexpected shape.
 */
export function extractAnthropicUsage(body: unknown): { input_tokens: number; output_tokens: number } {
  const usage = (body as { usage?: { input_tokens?: number; output_tokens?: number } } | null)?.usage;
  return {
    input_tokens: Math.max(0, Number(usage?.input_tokens ?? 0) || 0),
    output_tokens: Math.max(0, Number(usage?.output_tokens ?? 0) || 0),
  };
}
