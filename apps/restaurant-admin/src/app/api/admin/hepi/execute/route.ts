// POST /api/admin/hepi/execute — run a Hepi-proposed action AFTER the human
// clicks "Confirmă".
//
// Security model (defense in depth):
//   1. Platform-admin gate (same allow-list as Hepi itself).
//   2. The body carries a SIGNED proposal token (see lib/hepi/proposals). We
//      re-verify the HMAC + TTL — the client cannot forge an action or tamper
//      with params; it can only approve the exact proposal Hepi made.
//   3. We re-validate params against the action's schema (never trust the
//      decoded payload blindly).
//   4. The wrapped server action re-checks platform-admin AND writes audit_log;
//      we add a hepi.action_executed trail on top.
//
// body: { token: string }
// response: { ok: true, message: string } | { ok:false, error }

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { verifyProposal } from '@/lib/hepi/proposals';
import { validateAction } from '@/lib/hepi/action-registry';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLATFORM_SENTINEL_TENANT_ID = '00000000-0000-0000-0000-000000000000';
const bodySchema = z.object({ token: z.string().min(1).max(8000) });

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const payload = verifyProposal(parsed.data.token);
  if (!payload) {
    return NextResponse.json({ error: 'invalid_or_expired_proposal' }, { status: 400 });
  }

  const v = validateAction(payload.actionId, payload.params);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }

  const result = await v.action.execute(v.params);

  void logAudit({
    tenantId: PLATFORM_SENTINEL_TENANT_ID,
    actorUserId: auth.userId,
    action: 'hepi.action_executed',
    entityType: 'hepi_action',
    entityId: v.action.id,
    metadata: { params: v.params, ok: result.ok, via: 'confirm' },
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.message }, { status: 422 });
  }
  return NextResponse.json({ ok: true, message: result.message });
}
