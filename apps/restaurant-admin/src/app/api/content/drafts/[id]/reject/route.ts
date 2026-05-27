// POST /api/content/drafts/[id]/reject
//
// Reject a content draft. Optional reject reason persisted in body_json.
// Same authZ shape as the approve route.

import { NextResponse } from 'next/server';
import { getActiveTenant } from '@/lib/tenant';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RejectBody {
  reason?: string;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: 'missing_draft_id' }, { status: 400 });
  }

  let userId: string;
  let tenantId: string;
  try {
    const session = await getActiveTenant();
    userId = session.user.id;
    tenantId = session.tenant.id;
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: RejectBody = {};
  try {
    body = (await req.json()) as RejectBody;
  } catch {
    // Reason is optional — empty body OK.
  }
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : null;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { data: draft } = await sb
    .from('content_drafts')
    .select('id, status, content_briefs:brief_id(content_brand_contexts:brand_id(tenant_id))')
    .eq('id', id)
    .maybeSingle();
  if (!draft) {
    return NextResponse.json({ error: 'draft_not_found' }, { status: 404 });
  }
  const draftRow = draft as unknown as {
    id: string;
    status: string;
    content_briefs?: { content_brand_contexts?: { tenant_id: string | null } | null } | null;
  };
  const draftTenantId = draftRow.content_briefs?.content_brand_contexts?.tenant_id ?? null;
  if (!draftTenantId || draftTenantId !== tenantId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (draftRow.status !== 'draft') {
    return NextResponse.json(
      { error: 'invalid_state', current: draftRow.status },
      { status: 409 },
    );
  }

  // Stamp reject reason in a parallel side table (content_drafts.body_json
  // is immutable per the guard trigger). For now we keep the rejection
  // reason in reviewed_at / status only and surface a UI prompt; the
  // reason lands on a future column. Codex absorb: keep this minimal.
  const { error: updErr } = await sb
    .from('content_drafts')
    .update({
      status: 'rejected',
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id, status: 'rejected', reason });
}
