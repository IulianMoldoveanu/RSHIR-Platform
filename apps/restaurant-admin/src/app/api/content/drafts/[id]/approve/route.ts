// POST /api/content/drafts/[id]/approve
//
// Approve a content draft. The signed-in user must be a member of the
// tenant that owns the brand the draft belongs to. We trust the RLS
// trigger `guard_content_drafts_member_update` for column immutability,
// but still re-verify tenant ownership server-side because the trigger
// runs under the user session and we use the admin client here.
//
// Side effects:
//   - content_drafts.status → 'approved'
//   - reviewed_by + reviewed_at stamped server-side
//
// Optionally schedules a publication when `body.publishNow = true` and
// the draft has a body_json.format that maps to a publish channel. Default
// behavior is approve-only — patron schedules manually from the drafts UI.

import { NextResponse } from 'next/server';
import { getActiveTenant } from '@/lib/tenant';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DraftLookup {
  id: string;
  status: string;
  brief: {
    brand: {
      tenant_id: string | null;
    } | null;
  } | null;
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

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  // Load the draft via two simple joins (brief → brand) so we can verify
  // tenant ownership without trusting client-supplied data.
  const { data: draft, error: draftErr } = await sb
    .from('content_drafts')
    .select('id, status, content_briefs:brief_id(brand_id, content_brand_contexts:brand_id(tenant_id))')
    .eq('id', id)
    .maybeSingle();
  if (draftErr || !draft) {
    return NextResponse.json({ error: 'draft_not_found' }, { status: 404 });
  }
  // Codex P1 absorb (preemptive): supabase's join shape is awkward. Normalize.
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

  const { error: updErr } = await sb
    .from('content_drafts')
    .update({
      status: 'approved',
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id, status: 'approved' });
}
