// POST /api/ai/dispatch
//
// Generic admin-UI entry point for the Master Orchestrator. Any button in
// the admin app can call this route to drive a menu/marketing/ops/finance/
// compliance/cs/analytics intent — the route authenticates the OWNER/STAFF
// session, enforces a per-agent role gate, then forwards the call to the
// `ai-dispatch` edge fn via the server-only bridge.
//
// Before this lane shipped, only `supabase/functions/telegram-command-intake`
// could drive the dispatcher; web-side agent capabilities were stranded.
//
// SECURITY:
//   - This route is server-only and reads the Supabase session cookie.
//     There is no @Public() / Public() decorator; missing session ⇒ 401.
//   - Service-role usage happens INSIDE the edge fn, not here. The shared
//     secret used to call the fn is read from `HIR_NOTIFY_SECRET` and
//     never leaves the server.
//   - Per-agent role gate enforced HERE before the bridge call:
//       analytics, ops, cs, menu, marketing → OWNER or STAFF
//       compliance → OWNER (or platform-admin email)
//       finance    → OWNER only
//   - The orchestrator's trust gate runs on top of this: write intents
//     still hit PROPOSED unless the tenant pre-approved AUTO_*.

import { NextResponse } from 'next/server';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { dispatchViaEdge } from '@/lib/ai/master-orchestrator-edge-bridge';
import type { AgentName } from '@/lib/ai/master-orchestrator-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DispatchBody = {
  intent?: string;
  payload?: Record<string, unknown>;
};

type TenantRole = 'OWNER' | 'STAFF';

// Per-agent role gate. The orchestrator's trust gate handles destructive
// intents on top of this; the gate below is the hard floor (a STAFF user
// cannot reach the finance handler at all, regardless of trust config).
const AGENT_ROLE_GATE: Record<AgentName, ReadonlyArray<TenantRole>> = {
  master: ['OWNER', 'STAFF'],
  menu: ['OWNER', 'STAFF'],
  marketing: ['OWNER', 'STAFF'],
  ops: ['OWNER', 'STAFF'],
  cs: ['OWNER', 'STAFF'],
  analytics: ['OWNER', 'STAFF'],
  growth: ['OWNER', 'STAFF'],
  // Compliance: OWNER only on the tenant side. Platform-admin emails get a
  // bypass below (mirrors `assertTenantOwner`'s allow-list).
  compliance: ['OWNER'],
  // Finance: OWNER only, no platform-admin bypass either (we want the
  // tenant owner explicitly approving anything that talks money).
  finance: ['OWNER'],
};

// Set of agent prefixes we recognise. Intents are agent-prefixed
// ("menu.description_update") — split on the first dot.
function parseAgent(intent: string): AgentName | null {
  const dot = intent.indexOf('.');
  if (dot <= 0) return null;
  const head = intent.slice(0, dot);
  if (head in AGENT_ROLE_GATE) return head as AgentName;
  return null;
}

export async function POST(req: Request): Promise<NextResponse> {
  // 1. AuthN — read Supabase session cookie. 401 if absent.
  let tenantId: string;
  let userId: string;
  let userEmail: string | null;
  try {
    const ctx = await getActiveTenant();
    tenantId = ctx.tenant.id;
    userId = ctx.user.id;
    userEmail = ctx.user.email;
  } catch (e) {
    return NextResponse.json(
      { error: 'unauthenticated', message: e instanceof Error ? e.message : String(e) },
      { status: 401 },
    );
  }

  // 2. Parse body.
  let body: DispatchBody;
  try {
    body = (await req.json()) as DispatchBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const intent = typeof body.intent === 'string' ? body.intent.trim() : '';
  if (!intent) {
    return NextResponse.json({ error: 'missing_intent' }, { status: 400 });
  }
  const agent = parseAgent(intent);
  if (!agent) {
    // The orchestrator would also return unknown_intent, but failing fast
    // here saves a round-trip and surfaces typos at the UI sooner.
    return NextResponse.json(
      { ok: false, error: 'unknown_intent', message: `Intent "${intent}" has no recognised agent prefix.` },
      { status: 422 },
    );
  }
  const payload =
    body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : {};

  // 3. Role gate. Platform-admin bypass mirrors `setPaymentMode` — they
  //    can drive compliance intents on any tenant they impersonate, but
  //    finance stays OWNER-only.
  const allowedRoles = AGENT_ROLE_GATE[agent];
  const platformAdmin = isPlatformAdminEmail(userEmail);
  let allowed = false;
  if (platformAdmin && agent !== 'finance') {
    allowed = true;
  } else {
    let role: TenantRole | null;
    try {
      role = await getTenantRole(userId, tenantId);
    } catch (e) {
      return NextResponse.json(
        { error: 'role_check_failed', message: e instanceof Error ? e.message : String(e) },
        { status: 500 },
      );
    }
    if (role && allowedRoles.includes(role)) allowed = true;
  }
  if (!allowed) {
    return NextResponse.json(
      { error: 'forbidden', agent, allowed: allowedRoles },
      { status: 403 },
    );
  }

  // 4. Forward to edge fn bridge.
  const result = await dispatchViaEdge({
    tenantId,
    intent,
    payload,
    actorUserId: userId,
  });

  if (!result.ok) {
    // Map orchestrator + bridge errors to HTTP status codes. The bridge
    // already passed through 400/403/422 from the edge fn; for transport
    // failures we expose 502.
    if (result.error === 'unknown_intent') {
      return NextResponse.json(result, { status: 422 });
    }
    if (result.error === 'invalid_payload') {
      return NextResponse.json(result, { status: 400 });
    }
    if (result.error === 'forbidden') {
      return NextResponse.json(result, { status: 403 });
    }
    if (result.error === 'edge_fn_unreachable' || result.error === 'edge_fn_failed') {
      return NextResponse.json(result, { status: 502 });
    }
    if (result.error === 'server_misconfigured') {
      return NextResponse.json(result, { status: 500 });
    }
    // handler_threw
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result, { status: 200 });
}
