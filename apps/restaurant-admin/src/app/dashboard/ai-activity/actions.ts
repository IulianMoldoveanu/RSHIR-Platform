'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTenantMember, getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';

const REVERT_WINDOW_MS = 24 * 60 * 60 * 1000;

export type RevertResult =
  | { ok: true; runId: string }
  | { ok: false; error: string };

const revertSchema = z.object({
  runId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

// OWNER-only: mark a previously EXECUTED run as REVERTED and write a
// child REVERT row pointing back at it. The actual undo of the side
// effect is the responsibility of the agent that originally ran the
// action — Sprint 12 ships the audit primitive only; agent revert
// implementations land in Sprint 13/14 alongside each agent.
export async function revertAgentRun(
  expectedTenantId: string,
  raw: { runId: string; reason?: string },
): Promise<RevertResult> {
  if (!expectedTenantId) return { ok: false, error: 'missing_tenant_id' };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const { tenant } = await getActiveTenant();
  if (tenant.id !== expectedTenantId) return { ok: false, error: 'tenant_mismatch' };
  await assertTenantMember(user.id, expectedTenantId);

  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden' };

  const parsed = revertSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  // Re-read the row server-side so the revert window + ownership check
  // can't be spoofed via client tampering.
  const { data: existing, error: readErr } = await sb
    .from('copilot_agent_runs')
    .select('id, restaurant_id, state, created_at, reverted_at, agent_name, action_type, summary, pre_state, payload')
    .eq('id', parsed.data.runId)
    .maybeSingle();
  if (readErr) {
    console.warn('[ai-activity/revert] read failed:', readErr.message);
    return { ok: false, error: 'read_failed' };
  }
  if (!existing) return { ok: false, error: 'not_found' };
  if (existing.restaurant_id !== expectedTenantId) return { ok: false, error: 'tenant_mismatch' };
  if (existing.state !== 'EXECUTED') return { ok: false, error: 'not_revertible' };
  if (existing.reverted_at) return { ok: false, error: 'already_reverted' };
  if (!existing.pre_state) return { ok: false, error: 'no_pre_state' };

  const ageMs = existing.created_at
    ? Date.now() - new Date(existing.created_at).getTime()
    : Infinity;
  if (ageMs > REVERT_WINDOW_MS) return { ok: false, error: 'window_expired' };

  // Two writes: flip the original row to REVERTED, then insert a child
  // row that records the revert event itself. The child's pre_state is
  // the current state (so a future "redo" could replay), and parent_run_id
  // points back at the original.
  const now = new Date().toISOString();
  const { error: updateErr } = await sb
    .from('copilot_agent_runs')
    .update({
      state: 'REVERTED',
      reverted_at: now,
      reverted_by: user.id,
      reverted_reason: parsed.data.reason ?? null,
    })
    .eq('id', existing.id);
  if (updateErr) {
    console.warn('[ai-activity/revert] update failed:', updateErr.message);
    return { ok: false, error: 'update_failed' };
  }

  await sb
    .from('copilot_agent_runs')
    .insert({
      restaurant_id: existing.restaurant_id,
      agent_name: existing.agent_name,
      action_type: `${existing.action_type ?? 'unknown'}.revert`,
      state: 'EXECUTED',
      summary: `Anulare: ${existing.summary ?? existing.action_type ?? 'acțiune fără titlu'}`,
      payload: { reverted_run_id: existing.id, reason: parsed.data.reason ?? null },
      parent_run_id: existing.id,
      approved_by: user.id,
      approved_at: now,
      created_at: now,
    })
    .then((r: { error: unknown }) => r);

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: user.id,
    action: 'ai_ceo.run_reverted',
    entityType: 'copilot_agent_runs',
    entityId: existing.id,
    metadata: { reason: parsed.data.reason ?? null, action_type: existing.action_type ?? null },
  });

  revalidatePath('/dashboard/ai-activity');
  return { ok: true, runId: existing.id };
}

// OWNER-only: approve a PROPOSED row.
//
// CRITICAL — Sprint 12/13 scope split (Codex P1 on PR #341 commit
// af651c0):
//   The Sprint 12 dispatcher splits handlers into plan() + execute()
//   and the gate writes a PROPOSED row WITHOUT calling execute(). To
//   keep the surface honest, Approve does NOT flip state to EXECUTED —
//   that would mark the action as applied even though no side effect
//   ran. Instead Approve only stamps `approved_by` + `approved_at` on
//   the PROPOSED row. A Sprint 13 worker picks up rows where
//   `state='PROPOSED' AND approved_at IS NOT NULL` and runs the
//   handler's execute() phase, then transitions the state to EXECUTED.
//
//   For Sprint 12 the registry has zero non-readOnly intents wired
//   through dispatchIntent(); the existing Telegram /comenzi /vreme
//   etc. continue to hard-route. So no PROPOSED row can land today
//   with a real side effect waiting. The Approve UI flow exists only
//   so the schema + UX are exercised end-to-end before Sprint 13 turns
//   it on for real write agents.
const approveSchema = z.object({ runId: z.string().uuid() });

export async function approveProposedRun(
  expectedTenantId: string,
  raw: { runId: string },
): Promise<RevertResult> {
  if (!expectedTenantId) return { ok: false, error: 'missing_tenant_id' };
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };
  const { tenant } = await getActiveTenant();
  if (tenant.id !== expectedTenantId) return { ok: false, error: 'tenant_mismatch' };
  await assertTenantMember(user.id, expectedTenantId);
  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden' };
  const parsed = approveSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data: existing, error: readErr } = await sb
    .from('copilot_agent_runs')
    .select('id, restaurant_id, state, approved_at')
    .eq('id', parsed.data.runId)
    .maybeSingle();
  if (readErr) return { ok: false, error: 'read_failed' };
  if (!existing) return { ok: false, error: 'not_found' };
  if (existing.restaurant_id !== expectedTenantId) return { ok: false, error: 'tenant_mismatch' };
  if (existing.state !== 'PROPOSED') return { ok: false, error: 'not_proposed' };
  if (existing.approved_at) return { ok: false, error: 'already_approved' };

  const now = new Date().toISOString();
  // INTENTIONAL: state stays 'PROPOSED'. Only stamp approval. Sprint 13
  // worker is the one that flips state to EXECUTED after running the
  // handler's execute() phase against the saved payload.
  const { error } = await sb
    .from('copilot_agent_runs')
    .update({ approved_by: user.id, approved_at: now })
    .eq('id', existing.id);
  if (error) return { ok: false, error: 'update_failed' };

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: user.id,
    action: 'ai_ceo.run_approved',
    entityType: 'copilot_agent_runs',
    entityId: existing.id,
  });
  revalidatePath('/dashboard/ai-activity');
  return { ok: true, runId: existing.id };
}

export async function rejectProposedRun(
  expectedTenantId: string,
  raw: { runId: string; reason?: string },
): Promise<RevertResult> {
  if (!expectedTenantId) return { ok: false, error: 'missing_tenant_id' };
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };
  const { tenant } = await getActiveTenant();
  if (tenant.id !== expectedTenantId) return { ok: false, error: 'tenant_mismatch' };
  await assertTenantMember(user.id, expectedTenantId);
  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden' };

  const parsed = z.object({ runId: z.string().uuid(), reason: z.string().trim().max(500).optional() }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data: existing } = await sb
    .from('copilot_agent_runs')
    .select('id, restaurant_id, state')
    .eq('id', parsed.data.runId)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'not_found' };
  if (existing.restaurant_id !== expectedTenantId) return { ok: false, error: 'tenant_mismatch' };
  if (existing.state !== 'PROPOSED') return { ok: false, error: 'not_proposed' };

  const { error } = await sb
    .from('copilot_agent_runs')
    .update({ state: 'REJECTED', reverted_reason: parsed.data.reason ?? null })
    .eq('id', existing.id);
  if (error) return { ok: false, error: 'update_failed' };
  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: user.id,
    action: 'ai_ceo.run_rejected',
    entityType: 'copilot_agent_runs',
    entityId: existing.id,
    metadata: { reason: parsed.data.reason ?? null },
  });
  revalidatePath('/dashboard/ai-activity');
  return { ok: true, runId: existing.id };
}
