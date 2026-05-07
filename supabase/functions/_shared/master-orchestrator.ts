// Master Orchestrator — single entry point for AI intents.
//
// Sprint 12 skeleton. EXTENDS the existing AI CEO surface (copilot_*
// tables, Anthropic SDK, Telegram bot). Does NOT replace any shipped
// behaviour. Existing intents in `telegram-command-intake/index.ts` keep
// their hard-coded routing for now; this registry gives sub-agents a
// stable API to register through and unblocks Sprint 13 incremental
// migration.
//
// Goals:
//  - Single dispatch surface across channels (telegram | web | voice).
//  - Trust-level gate: every intent declares an action_category; the
//    dispatcher consults `agent_trust_calibration` per tenant and either
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
  // Action category the handler is reporting — the dispatcher uses this to
  // resolve trust level + write the ledger row. Examples:
  // 'analytics.read', 'menu.description.update', 'price.change'.
  actionCategory: string;
  // Human-readable one-liner stored as `summary` on the ledger row.
  summary: string;
  // Optional pre-state for revert. Skip when the action is non-revertible
  // (read-only, transient).
  preState?: Record<string, unknown>;
  // What the handler returns to the caller.
  data: unknown;
};

export type IntentHandler = (
  ctx: HandlerContext,
  payload: Record<string, unknown>,
) => Promise<HandlerResult>;

export type IntentRegistration = {
  name: string;
  agent: AgentName;
  // The default action_category this intent reports. Handlers MAY override
  // per-call (e.g. /menu can do both 'description.update' and 'price.change').
  defaultCategory: string;
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
    .from('agent_trust_calibration')
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

  let result: HandlerResult;
  try {
    result = await reg.handler(ctx, input.payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[master-orchestrator] handler "${input.intent}" threw:`, message);
    return { ok: false, error: 'handler_threw', message };
  }

  const trust = await resolveTrust(
    supabase,
    input.tenantId,
    reg.agent,
    result.actionCategory,
  );

  // PROPOSE_ONLY -> handler already ran (read or compute); we still write
  // a PROPOSED ledger row when the intent has a non-trivial pre_state, so
  // the OWNER can either Approve (move state -> EXECUTED) or Reject. For
  // pure read-only intents (preState == null) we write EXECUTED directly.
  const isReadOnly = !result.preState || Object.keys(result.preState).length === 0;
  let ledgerState: RunState = 'EXECUTED';
  if (trust === 'PROPOSE_ONLY' && !isReadOnly) ledgerState = 'PROPOSED';
  // AUTO_REVERSIBLE and AUTO_FULL both EXECUTE; the difference is whether
  // the action is reversible (24h revert window vs irreversible). The
  // dispatcher itself doesn't enforce that — the handler is responsible
  // for picking the right action_category.

  const runId = await writeLedger(supabase, {
    tenantId: input.tenantId,
    agentName: reg.agent,
    actionType: `${reg.agent}.${result.actionCategory}`,
    state: ledgerState,
    payload: input.payload,
    summary: result.summary,
    preState: result.preState,
    actorUserId: input.actorUserId ?? null,
  });

  if (ledgerState === 'PROPOSED') {
    return {
      ok: true,
      state: 'PROPOSED',
      runId: runId ?? '',
      reason: 'trust_level',
      summary: result.summary,
    };
  }
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
  'name' | 'agent' | 'defaultCategory' | 'description'
>;

// Static map of known intents — mirrors the registry and is used by the
// admin "Intent registry" UI even before each handler is wired through
// dispatchIntent(). Source of truth for documentation.
export const KNOWN_INTENTS: RegistryEntry[] = [
  // --- Analytics agent (read) ---
  { name: 'analytics.summary', agent: 'analytics', defaultCategory: 'analytics.read', description: 'Sumar comenzi/încasări pentru o perioadă.' },
  { name: 'analytics.top_products', agent: 'analytics', defaultCategory: 'analytics.read', description: 'Top produse vândute pentru o perioadă.' },
  { name: 'analytics.recommendations_today', agent: 'analytics', defaultCategory: 'analytics.read', description: 'Ultimele recomandări de creștere pentru tenant.' },
  { name: 'analytics.report', agent: 'analytics', defaultCategory: 'analytics.read', description: 'Raport zilnic compact (orders + sales + low_stock).' },
  // --- Ops agent (read) ---
  { name: 'ops.orders_now', agent: 'ops', defaultCategory: 'ops.read', description: 'Câte comenzi sunt active acum.' },
  { name: 'ops.couriers_online', agent: 'ops', defaultCategory: 'ops.read', description: 'Câți curieri sunt online acum.' },
  { name: 'ops.low_stock', agent: 'ops', defaultCategory: 'ops.read', description: 'Produse cu stoc scăzut.' },
  { name: 'ops.weather_today', agent: 'ops', defaultCategory: 'ops.read', description: 'Vremea curentă pentru orașul tenantului.' },
  // --- CS agent (write, low-risk) ---
  { name: 'cs.reservation_create', agent: 'cs', defaultCategory: 'reservation.create', description: 'Creează o rezervare nouă.' },
  { name: 'cs.reservation_list', agent: 'cs', defaultCategory: 'reservation.read', description: 'Listează rezervările următoare.' },
  { name: 'cs.reservation_cancel', agent: 'cs', defaultCategory: 'reservation.cancel', description: 'Anulează o rezervare după token.' },
  // --- Menu agent (write, mixed risk) — placeholders for Sprint 14 ---
  { name: 'menu.description_update', agent: 'menu', defaultCategory: 'description.update', description: 'Actualizează descrierea unui produs.' },
  { name: 'menu.price_change', agent: 'menu', defaultCategory: 'price.change', description: 'Schimbă prețul unui produs (destructiv).' },
  // --- Marketing agent (write) — placeholders for Sprint 14 ---
  { name: 'marketing.draft_post', agent: 'marketing', defaultCategory: 'social.draft', description: 'Generează draft de postare social.' },
  { name: 'marketing.publish_post', agent: 'marketing', defaultCategory: 'social.publish', description: 'Publică o postare social.' },
];
