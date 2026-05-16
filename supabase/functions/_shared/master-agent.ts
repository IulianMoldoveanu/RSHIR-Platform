// HIR Master Agent — F6 closure meta-handler.
//
// Up until this commit the `master` agent in the orchestrator was a
// label-only namespace: the dispatcher routed sub-agent intents
// (menu/marketing/ops/cs/analytics/finance/compliance/growth) but had no
// way for a channel to *introspect* the registry through dispatchIntent
// itself. The cs-agent + growth-agent registrations each closed their
// respective gaps; this module closes the last one by exposing a single
// read intent that returns the live registry:
//
//   master.list_intents — paginated list of registered intents, optional
//                          agent filter, optional readOnly filter. Always
//                          read-only; dispatcher bypasses the trust gate.
//
// Why a meta-intent and not a separate edge endpoint:
// - Every channel (telegram, web admin, voice) already speaks
//   dispatchIntent. Adding a second wire format for "what can I run?"
//   doubles the surface for one bit of data the dispatcher already owns.
// - The KNOWN_INTENTS constant lives next to dispatchIntent and is the
//   documentation surface. Reflecting the *live* registry catches drift
//   between KNOWN_INTENTS (static doc) and the in-process REGISTRY
//   (what handlers are actually wired) — telegram diagnostics can call
//   `master.list_intents` and compare against the static list.
//
// Pattern mirror: `_shared/growth-agent.ts` registration shape.

import {
  listIntents,
  registerIntent,
  type AgentName,
  type HandlerPlan,
  type HandlerResult,
  type IntentHandler,
} from './master-orchestrator.ts';

// Agent names allowed on the filter — kept tight so a typo surfaces
// immediately rather than returning an empty list.
const ALLOWED_AGENTS: AgentName[] = [
  'master',
  'menu',
  'marketing',
  'ops',
  'cs',
  'analytics',
  'finance',
  'compliance',
  'growth',
];

function asAgentFilter(v: unknown): AgentName | null {
  if (typeof v !== 'string') return null;
  return (ALLOWED_AGENTS as readonly string[]).includes(v)
    ? (v as AgentName)
    : null;
}

function asReadOnlyFilter(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  return null;
}

// Public-shape of a registry row — we strip the actual handler before
// returning to the caller. Handlers reference Supabase clients + closure
// state that doesn't belong on the wire.
type PublicIntent = {
  name: string;
  agent: AgentName;
  defaultCategory: string;
  description: string;
  readOnly: boolean;
};

// Payload: { agent?: AgentName, readOnly?: boolean }
const listIntentsHandler: IntentHandler = {
  plan: async (_ctx, payload) => {
    const agentFilter = asAgentFilter((payload as Record<string, unknown>).agent);
    const readOnlyFilter = asReadOnlyFilter((payload as Record<string, unknown>).readOnly);
    const filters: string[] = [];
    if (agentFilter) filters.push(`agent=${agentFilter}`);
    if (readOnlyFilter !== null) filters.push(`readOnly=${readOnlyFilter}`);
    return {
      actionCategory: 'master.read',
      summary: filters.length > 0
        ? `List registered intents (${filters.join(', ')}).`
        : 'List all registered intents.',
      resolvedPayload: {
        agent: agentFilter,
        readOnly: readOnlyFilter,
      },
    } satisfies HandlerPlan;
  },
  execute: async (_ctx, plan) => {
    const { agent, readOnly } = (plan.resolvedPayload ?? {}) as {
      agent: AgentName | null;
      readOnly: boolean | null;
    };
    const all = listIntents();
    const filtered = all.filter((reg) => {
      if (agent && reg.agent !== agent) return false;
      if (readOnly !== null && Boolean(reg.readOnly) !== readOnly) return false;
      return true;
    });
    const publicIntents: PublicIntent[] = filtered.map((reg) => ({
      name: reg.name,
      agent: reg.agent,
      defaultCategory: reg.defaultCategory,
      description: reg.description,
      readOnly: Boolean(reg.readOnly),
    }));
    return {
      summary: `Returned ${publicIntents.length} registered intent(s).`,
      data: {
        count: publicIntents.length,
        intents: publicIntents,
      },
    } satisfies HandlerResult;
  },
};

// ---------------------------------------------------------------------------
// Registration — idempotent
// ---------------------------------------------------------------------------

let registered = false;

export function registerMasterIntents(): void {
  if (registered) return;
  registered = true;

  registerIntent({
    name: 'master.list_intents',
    agent: 'master',
    defaultCategory: 'master.read',
    description: 'Listează intent-urile înregistrate (filtrabil pe agent + readOnly).',
    readOnly: true,
    handler: listIntentsHandler,
  });
}

export function __resetMasterRegisteredForTesting(): void {
  registered = false;
}
