'use server';

// Menu Agent — server actions for the "Sugestii Hepy" tab on /dashboard/menu.
//
// Sprint 12 scope:
//   - listProposals(tenantId, status?)  — read DRAFT/ACCEPTED/DISMISSED rows
//   - acceptProposal(runId, note?)      — OWNER stamps decision = ACCEPTED
//   - dismissProposal(runId, note?)     — OWNER stamps decision = DISMISSED
//
// Per the lane brief: Accept does NOT mutate `restaurant_menu_items`. The
// OWNER applies the suggestion by hand on the existing Menu page using the
// proposal as a guide. This keeps the blast radius zero on the customer
// surface and matches Iulian's directive: "DO NOT auto-publish menu items
// in this lane — keep proposals in DRAFT only".

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTenantMember, getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit, type AuditAction } from '@/lib/audit';
import type { MenuAgentProposalRow } from '@/lib/ai/agents/menu-agent';

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

const decisionSchema = z.object({
  proposalId: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
});

async function decideProposal(
  expectedTenantId: string,
  raw: { proposalId: string; note?: string },
  next: 'ACCEPTED' | 'DISMISSED',
  auditAction: AuditAction,
): Promise<ActionResult> {
  if (!expectedTenantId) return { ok: false, error: 'missing_tenant_id' };
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const { tenant } = await getActiveTenant();
  if (tenant.id !== expectedTenantId) return { ok: false, error: 'tenant_mismatch' };
  await assertTenantMember(user.id, expectedTenantId);

  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden' };

  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { data: existing, error: readErr } = await sb
    .from('menu_agent_proposals')
    .select('id, tenant_id, status, kind')
    .eq('id', parsed.data.proposalId)
    .maybeSingle();
  if (readErr) {
    console.warn('[menu-agent/decide] read failed:', readErr.message);
    return { ok: false, error: 'read_failed' };
  }
  if (!existing) return { ok: false, error: 'not_found' };
  if (existing.tenant_id !== expectedTenantId) return { ok: false, error: 'tenant_mismatch' };
  if (existing.status !== 'DRAFT') return { ok: false, error: 'already_decided' };

  const now = new Date().toISOString();
  const { error: updateErr } = await sb
    .from('menu_agent_proposals')
    .update({
      status: next,
      decided_at: now,
      decided_by: user.id,
      decision_note: parsed.data.note ?? null,
    })
    .eq('id', existing.id);
  if (updateErr) {
    console.warn('[menu-agent/decide] update failed:', updateErr.message);
    return { ok: false, error: 'update_failed' };
  }

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: user.id,
    action: auditAction,
    entityType: 'menu_agent_proposals',
    entityId: existing.id,
    metadata: { kind: existing.kind, note: parsed.data.note ?? null },
  });

  revalidatePath('/dashboard/menu');
  return { ok: true, id: existing.id };
}

export async function acceptProposal(
  expectedTenantId: string,
  raw: { proposalId: string; note?: string },
): Promise<ActionResult> {
  return decideProposal(expectedTenantId, raw, 'ACCEPTED', 'menu_agent.proposal_accepted');
}

export async function dismissProposal(
  expectedTenantId: string,
  raw: { proposalId: string; note?: string },
): Promise<ActionResult> {
  return decideProposal(expectedTenantId, raw, 'DISMISSED', 'menu_agent.proposal_dismissed');
}

// Server-side fetcher used by the menu page's "Sugestii Hepy" tab. Caps at
// 50 rows — typical tenant won't accumulate more DRAFT proposals than the
// daily cap × a few days. Caller filters by status when needed.
export async function loadProposals(
  tenantId: string,
  opts?: { status?: 'DRAFT' | 'ACCEPTED' | 'DISMISSED'; limit?: number },
): Promise<MenuAgentProposalRow[]> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  let q = sb
    .from('menu_agent_proposals')
    .select(
      'id, tenant_id, agent_run_id, kind, status, payload, rationale, model, input_tokens, output_tokens, decided_at, decided_by, decision_note, created_at, channel',
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 50);
  if (opts?.status) q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) {
    console.warn('[menu-agent/load] query failed:', error.message);
    return [];
  }
  return (data ?? []) as MenuAgentProposalRow[];
}
