// Master Orchestrator — single entry point for AI intents.
//
// Sprint 12 skeleton. EXTENDS the existing AI CEO surface (copilot_*
// tables, Anthropic SDK, Telegram bot). Does NOT replace any shipped
// behaviour. Existing intents in `telegram-command-intake/index.ts` keep
// their hard-coded routing for now; this registry gives sub-agents a
// stable API to register through and unblocks Sprint 13 incremental
// migration.
//
// Two-phase handler contract:
//   plan()    — pure, MUST NOT mutate. Returns the action_category +
//               human-readable summary + optional pre_state. Runs first.
//   execute() — performs the side effect. The dispatcher only calls
//               execute() AFTER the trust gate has decided EXECUTED.
//               This is the architectural fix for Codex P1 review on
//               PR #341 — without phase-split, a write handler under
//               PROPOSE_ONLY would mutate state before the gate refused
//               to execute, leaving the OWNER an "approve" button that
//               does nothing.
//
// Goals:
//  - Single dispatch surface across channels (telegram | web | voice).
//  - Trust-level gate: every intent declares an action_category; the
//    dispatcher consults `tenant_agent_trust` per tenant and either
//    EXECUTEs immediately, PROPOSEs (writes a PROPOSED ledger row owners
//    must approve) or rejects.
//  - Audit-by-default: every dispatch writes a row to `copilot_agent_runs`
//    with pre_state, payload, action_type, agent_name. Revert is just
//    flipping a state field on the same row + writing a child REVERTED
//    row with parent_run_id.
//
// Deno-compatible. Imported by edge functions; mirrored type-only by the
// Next.js admin app at `apps/restaurant-admin/src/lib/ai/master-orchestrator-types.ts`.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Channel = 'telegram' | 'web' | 'voice';

export type AgentName =
  | 'master'
  | 'menu'
  | 'marketing'
  | 'ops'
  | 'cs'
  | 'analytics'
  | 'finance'
  | 'compliance'
  | 'growth';

export type TrustLevel = 'PROPOSE_ONLY' | 'AUTO_REVERSIBLE' | 'AUTO_FULL';

export type RunState = 'PROPOSED' | 'EXECUTED' | 'REVERTED' | 'REJECTED';

export type DispatchInput = {
  tenantId: string;
  channel: Channel;
  intent: string;
  payload: Record<string, unknown>;
  // Optional caller identity, used for audit `approved_by`. Edge function
  // callers usually omit; admin server actions pass the OWNER's auth.uid.
  actorUserId?: string | null;
};

export type DispatchResult =
  | {
      ok: true;
      state: 'EXECUTED';
      runId: string;
      // Free-form payload returned to the caller — what the intent did.
      // Channel-side code formats this for the user (Telegram HTML, web JSON).
      data: unknown;
    }
  | {
      ok: true;
      state: 'PROPOSED';
      runId: string;
      // Why the dispatcher refused to auto-execute. Always 'trust_level' for
      // now; future kinds: 'second_line_check_disagreed', 'rate_limited'.
      reason: 'trust_level';
      summary: string;
    }
  | {
      ok: false;
      error: 'unknown_intent' | 'forbidden' | 'invalid_payload' | 'handler_threw';
      message: string;
    };

// Intent handlers receive a context object so they can call back into
// helpers (Supabase client, action-category mapping). They MUST return a
// HandlerResult; the dispatcher takes care of writing the ledger row.
export type HandlerContext = {
  tenantId: string;
  channel: Channel;
  actorUserId: string | null;
  // Service-role Supabase client. Typed as `any` so this file stays
  // dependency-free (each caller imports `@supabase/supabase-js` separately).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
};

export type HandlerResult = {
  // Human-readable one-liner stored as `summary` on the ledger row.
  summary: string;
  // Optional pre-state captured before the side effect. Used by revert.
  // Read-only intents (analytics, ops queries) leave this empty/undefined.
  preState?: Record<string, unknown>;
  // What the handler returns to the caller (channel-side formats it).
  data: unknown;
};

// Plan result — what the handler intends to do, computed BEFORE the
// trust gate so the dispatcher can refuse to run a mutating handler
// when the tenant has set the category to PROPOSE_ONLY. Plan must be
// pure: no DB writes, no external side effects. Plan output is stored
// on the ledger row's `payload` so a later Approve can replay it.
export type HandlerPlan = {
  // Action category for the trust gate, e.g. 'description.update'.
  // Handlers MAY override the registration's defaultCategory at plan
  // time (e.g. one /menu intent that touches both `description.update`
  // and `price.change` depending on payload).
  actionCategory: string;
  // Human-readable one-liner shown to the OWNER in the approval UI
  // and stored as `summary` on the PROPOSED ledger row.
  summary: string;
  // Optional pre-state to capture (read once during plan; revert uses
  // this to restore). Skip for read-only intents.
  preState?: Record<string, unknown>;
  // Free-form payload echo — what the execute phase will need to
  // actually run the side effect. Stored as the ledger row's `payload`.
  // For a PROPOSED row, this is what Approve replays through `execute`.
  resolvedPayload?: Record<string, unknown>;
};

// Two-phase handler. The dispatcher always calls `plan` first; if the
// trust gate decides EXECUTE, it then calls `execute` with the plan
// output. Read-only intents implement plan == execute (the
// `readOnly: true` flag on registration tells the dispatcher to skip
// the trust gate entirely).
export type IntentHandler = {
  // Pure planning step. MUST NOT mutate Supabase or call external APIs
  // that have side effects. May READ from Supabase to compute pre_state.
  plan: (
    ctx: HandlerContext,
    payload: Record<string, unknown>,
  ) => Promise<HandlerPlan>;
  // Executes the side effect. Called by the dispatcher after plan when
  // trust resolves to EXECUTED, or by the future Approve action when an
  // OWNER approves a PROPOSED row.
  execute: (
    ctx: HandlerContext,
    plan: HandlerPlan,
  ) => Promise<HandlerResult>;
};

export type IntentRegistration = {
  name: string;
  agent: AgentName;
  // The default action_category this intent reports. Plan MAY override
  // per-call.
  defaultCategory: string;
  // When true, dispatcher bypasses the trust gate (analytics + ops reads
  // are always EXECUTED — no point asking the OWNER to approve a query
  // that returns "you have 3 active orders"). Defaults to false.
  readOnly?: boolean;
  // Free-form one-liner shown in the admin "Intent registry" UI.
  description: string;
  handler: IntentHandler;
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const REGISTRY: Map<string, IntentRegistration> = new Map();

export function registerIntent(reg: IntentRegistration): void {
  if (REGISTRY.has(reg.name)) {
    // Re-registration is a programming error; surface loudly so it doesn't
    // silently overwrite a shipped intent.
    console.warn(
      `[master-orchestrator] intent already registered: ${reg.name}; ignoring duplicate`,
    );
    return;
  }
  REGISTRY.set(reg.name, reg);
}

export function listIntents(): IntentRegistration[] {
  return Array.from(REGISTRY.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function clearRegistryForTesting(): void {
  REGISTRY.clear();
}

// ---------------------------------------------------------------------------
// Trust resolution
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveTrust(supabase: any, tenantId: string, agent: AgentName, actionCategory: string): Promise<TrustLevel> {
  const { data, error } = await supabase
    .from('tenant_agent_trust')
    .select('trust_level, is_destructive')
    .eq('restaurant_id', tenantId)
    .eq('agent_name', agent)
    .eq('action_category', actionCategory)
    .maybeSingle();
  if (error) {
    console.warn('[master-orchestrator] resolveTrust query failed:', error.message);
    return 'PROPOSE_ONLY';
  }
  if (!data) return 'PROPOSE_ONLY';
  // Destructive guard at the dispatcher level — even a misconfigured row
  // can't escalate past PROPOSE_ONLY.
  if (data.is_destructive) return 'PROPOSE_ONLY';
  return (data.trust_level as TrustLevel) ?? 'PROPOSE_ONLY';
}

// ---------------------------------------------------------------------------
// Ledger writers
// ---------------------------------------------------------------------------

async function writeLedger(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  row: {
    tenantId: string;
    agentName: AgentName;
    actionType: string;
    state: RunState;
    payload: Record<string, unknown>;
    summary: string;
    preState?: Record<string, unknown>;
    actorUserId: string | null;
    parentRunId?: string;
  },
): Promise<string | null> {
  const insert: Record<string, unknown> = {
    restaurant_id: row.tenantId,
    agent_name: row.agentName,
    action_type: row.actionType,
    state: row.state,
    payload: row.payload,
    summary: row.summary,
    pre_state: row.preState ?? null,
    parent_run_id: row.parentRunId ?? null,
    created_at: new Date().toISOString(),
  };
  if (row.state === 'EXECUTED' && row.actorUserId) {
    insert.approved_by = row.actorUserId;
    insert.approved_at = new Date().toISOString();
  }
  const { data, error } = await supabase
    .from('copilot_agent_runs')
    .insert(insert)
    .select('id')
    .maybeSingle();
  if (error) {
    console.warn('[master-orchestrator] ledger insert failed:', error.message);
    return null;
  }
  return (data?.id as string | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export async function dispatchIntent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  input: DispatchInput,
): Promise<DispatchResult> {
  const reg = REGISTRY.get(input.intent);
  if (!reg) {
    return {
      ok: false,
      error: 'unknown_intent',
      message: `Intent "${input.intent}" is not registered.`,
    };
  }

  const ctx: HandlerContext = {
    tenantId: input.tenantId,
    channel: input.channel,
    actorUserId: input.actorUserId ?? null,
    supabase,
  };

  // PHASE 1 — plan. Pure: no side effects, may read for pre_state.
  // CRITICAL: this runs BEFORE the trust gate so a write handler whose
  // tenant/category resolves to PROPOSE_ONLY is NOT executed (the
  // execute() phase below is what mutates state).
  let plan: HandlerPlan;
  try {
    plan = await reg.handler.plan(ctx, input.payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[master-orchestrator] plan "${input.intent}" threw:`, message);
    return { ok: false, error: 'handler_threw', message };
  }

  // Read-only intents skip the trust gate entirely. The dispatcher still
  // writes an EXECUTED ledger row so usage is auditable.
  let ledgerState: RunState = 'EXECUTED';
  if (!reg.readOnly) {
    const trust = await resolveTrust(
      supabase,
      input.tenantId,
      reg.agent,
      plan.actionCategory,
    );
    if (trust === 'PROPOSE_ONLY') ledgerState = 'PROPOSED';
    // AUTO_REVERSIBLE / AUTO_FULL both EXECUTE; the difference matters
    // only for the revert UI window (24 h vs locked).
  }

  // PROPOSED branch: write the ledger row with the plan output as
  // payload (so a future Approve can replay it through execute()) and
  // STOP. Side effect not yet performed.
  if (ledgerState === 'PROPOSED') {
    const runId = await writeLedger(supabase, {
      tenantId: input.tenantId,
      agentName: reg.agent,
      actionType: `${reg.agent}.${plan.actionCategory}`,
      state: 'PROPOSED',
      payload: plan.resolvedPayload ?? input.payload,
      summary: plan.summary,
      preState: plan.preState,
      actorUserId: input.actorUserId ?? null,
    });
    return {
      ok: true,
      state: 'PROPOSED',
      runId: runId ?? '',
      reason: 'trust_level',
      summary: plan.summary,
    };
  }

  // PHASE 2 — execute. Trust resolved to EXECUTED (or read-only), so we
  // run the side effect now and write an EXECUTED ledger row with the
  // result.
  let result: HandlerResult;
  try {
    result = await reg.handler.execute(ctx, plan);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[master-orchestrator] execute "${input.intent}" threw:`, message);
    return { ok: false, error: 'handler_threw', message };
  }

  const runId = await writeLedger(supabase, {
    tenantId: input.tenantId,
    agentName: reg.agent,
    actionType: `${reg.agent}.${plan.actionCategory}`,
    state: 'EXECUTED',
    payload: plan.resolvedPayload ?? input.payload,
    summary: result.summary,
    preState: result.preState ?? plan.preState,
    actorUserId: input.actorUserId ?? null,
  });

  return {
    ok: true,
    state: 'EXECUTED',
    runId: runId ?? '',
    data: result.data,
  };
}

// ---------------------------------------------------------------------------
// Built-in intents — register the existing AI CEO surface so the registry
// is discoverable from day 1. These are placeholder declarations only;
// the actual handlers continue to live where they shipped (Telegram bot
// for /comenzi, /vreme, etc; daily-brief Edge Function for analytics).
// Sprint 13 will progressively migrate each into a real handler.
// ---------------------------------------------------------------------------

export type RegistryEntry = Pick<
  IntentRegistration,
  'name' | 'agent' | 'defaultCategory' | 'description' | 'readOnly'
>;

// Static map of known intents — mirrors the registry and is used by the
// admin "Intent registry" UI even before each handler is wired through
// dispatchIntent(). Source of truth for documentation.
export const KNOWN_INTENTS: RegistryEntry[] = [
  // --- Analytics agent (read) ---
  { name: 'analytics.summary', agent: 'analytics', defaultCategory: 'analytics.read', description: 'Sumar comenzi/încasări pentru o perioadă.', readOnly: true },
  { name: 'analytics.top_products', agent: 'analytics', defaultCategory: 'analytics.read', description: 'Top produse vândute pentru o perioadă.', readOnly: true },
  { name: 'analytics.recommendations_today', agent: 'analytics', defaultCategory: 'analytics.read', description: 'Ultimele recomandări de creștere pentru tenant.', readOnly: true },
  { name: 'analytics.report', agent: 'analytics', defaultCategory: 'analytics.read', description: 'Raport zilnic compact (orders + sales + low_stock).', readOnly: true },
  // --- Ops agent (read) ---
  { name: 'ops.orders_now', agent: 'ops', defaultCategory: 'ops.read', description: 'Câte comenzi sunt active acum.', readOnly: true },
  { name: 'ops.couriers_online', agent: 'ops', defaultCategory: 'ops.read', description: 'Câți curieri sunt online acum.', readOnly: true },
  { name: 'ops.low_stock', agent: 'ops', defaultCategory: 'ops.read', description: 'Produse cu stoc scăzut.', readOnly: true },
  { name: 'ops.weather_today', agent: 'ops', defaultCategory: 'ops.read', description: 'Vremea curentă pentru orașul tenantului.', readOnly: true },
  // --- CS agent (write, low-risk) ---
  { name: 'cs.reservation_create', agent: 'cs', defaultCategory: 'reservation.create', description: 'Creează o rezervare nouă.' },
  { name: 'cs.reservation_list', agent: 'cs', defaultCategory: 'reservation.read', description: 'Listează rezervările următoare.', readOnly: true },
  { name: 'cs.reservation_cancel', agent: 'cs', defaultCategory: 'reservation.cancel', description: 'Anulează o rezervare după token.' },
  // --- Menu agent (write, mixed risk) — placeholders for Sprint 14 ---
  { name: 'menu.description_update', agent: 'menu', defaultCategory: 'description.update', description: 'Actualizează descrierea unui produs.' },
  { name: 'menu.price_change', agent: 'menu', defaultCategory: 'price.change', description: 'Schimbă prețul unui produs (destructiv).' },
  // --- Marketing agent (write) — placeholders for Sprint 14 ---
  { name: 'marketing.draft_post', agent: 'marketing', defaultCategory: 'social.draft', description: 'Generează draft de postare social.' },
  { name: 'marketing.publish_post', agent: 'marketing', defaultCategory: 'social.publish', description: 'Publică o postare social.' },
];
