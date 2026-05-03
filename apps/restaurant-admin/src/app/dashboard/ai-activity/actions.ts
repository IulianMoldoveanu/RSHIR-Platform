'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTenantMember, getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';
import {
  getAgentRun,
  isReversibleActionType,
  isWithin24h,
} from '@/lib/agents/runs';

const revertSchema = z.object({
  runId: z.string().uuid(),
  reason: z.string().trim().max(500).optional().default(''),
});

export type RevertResult = { ok: true } | { ok: false; error: string };

// OWNER-only: revert a previously EXECUTED copilot_agent_runs row.
//
// Strategy:
//  1. Re-read the run scoped by restaurant_id (defense against tenant-id guess).
//  2. Validate state (status=EXECUTED, within 24h, reversible action_type, not already reverted).
//  3. Apply the inverse op for the action_type. Sprint 12 ships only menu.bulk_import inverse —
//     other action_types return `not_reversible_yet`. The list grows per sub-agent.
//  4. Update the original row: status='REVERTED', reverted_at, reverted_by, reverted_reason.
//  5. Insert a new copilot_agent_runs row tracking the revert (parent_run_id = original).
export async function revertAgentRun(
  expectedTenantId: string,
  raw: { runId: string; reason?: string },
): Promise<RevertResult> {
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

  const parsed = revertSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { runId, reason } = parsed.data;

  const run = await getAgentRun(expectedTenantId, runId);
  if (!run) return { ok: false, error: 'not_found' };
  if (run.status !== 'EXECUTED') return { ok: false, error: 'not_executed' };
  if (run.reverted_at) return { ok: false, error: 'already_reverted' };
  if (!isWithin24h(run.created_at)) return { ok: false, error: 'window_expired' };
  if (!isReversibleActionType(run.action_type)) {
    return { ok: false, error: 'not_reversible_yet' };
  }

  const admin = createAdminClient() as any;

  // Inverse op dispatch. Each branch is small and self-contained; we
  // prefer this over a registry pattern until we have >5 entries.
  let inverseOk = false;
  let inverseError: string | null = null;

  if (run.action_type === 'menu.bulk_import') {
    const result = await applyMenuBulkImportInverse(admin, expectedTenantId, run.payload);
    inverseOk = result.ok;
    inverseError = result.ok ? null : result.error;
  } else if (
    run.action_type === 'menu.item.create' ||
    run.action_type === 'menu.description.update' ||
    run.action_type === 'menu.photo.upload'
  ) {
    // These categories don't have an inverse implementation yet — when
    // a sub-agent starts emitting them, add the inverse here.
    inverseError = 'not_reversible_yet';
  } else {
    inverseError = 'not_reversible_yet';
  }

  if (!inverseOk) {
    console.warn('[ai-activity/actions] inverse op failed', inverseError);
    return { ok: false, error: inverseError ?? 'inverse_failed' };
  }

  // Mark the original row as reverted.
  const { error: updateErr } = await admin
    .from('copilot_agent_runs')
    .update({
      status: 'REVERTED',
      reverted_at: new Date().toISOString(),
      reverted_by: user.id,
      reverted_reason: reason || null,
    })
    .eq('id', runId)
    .eq('restaurant_id', expectedTenantId);
  if (updateErr) {
    console.error('[ai-activity/actions] mark reverted failed', updateErr.message);
    return { ok: false, error: 'db_error' };
  }

  // Insert a child run that records the revert as its own ledger entry.
  await admin.from('copilot_agent_runs').insert({
    restaurant_id: expectedTenantId,
    agent_name: run.agent_name ?? 'orchestrator',
    action_type: `REVERT_OF:${run.action_type}`,
    payload: { original_run_id: runId, reason: reason || null },
    status: 'EXECUTED',
    parent_run_id: runId,
    summary: `Anulare: ${run.summary ?? run.action_type}`,
  });

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: user.id,
    action: 'ai_ceo.run_reverted',
    entityType: 'copilot_agent_run',
    entityId: runId,
    metadata: {
      action_type: run.action_type,
      agent_name: run.agent_name,
      reason: reason || null,
    },
  });

  revalidatePath('/dashboard/ai-activity');
  return { ok: true };
}

// Inverse of menu.bulk_import: delete the items + categories that the
// import created. Payload shape: { created_item_ids: string[],
// created_category_ids: string[] }. If the list is missing (older row),
// fall back to deleting items by `(tenant_id, name)` from the parsed
// menu — best-effort, safer to surface a partial-revert message than to
// crash.
async function applyMenuBulkImportInverse(
  admin: any,
  tenantId: string,
  payload: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'no_payload' };
  }
  const p = payload as {
    created_item_ids?: string[];
    created_category_ids?: string[];
  };
  const itemIds = Array.isArray(p.created_item_ids) ? p.created_item_ids : [];
  const catIds = Array.isArray(p.created_category_ids) ? p.created_category_ids : [];

  if (itemIds.length === 0 && catIds.length === 0) {
    return { ok: false, error: 'payload_missing_ids' };
  }

  if (itemIds.length > 0) {
    const { error } = await admin
      .from('restaurant_menu_items')
      .delete()
      .eq('tenant_id', tenantId)
      .in('id', itemIds);
    if (error) return { ok: false, error: error.message };
  }
  if (catIds.length > 0) {
    // Only delete categories that are now empty (some categories may have
    // existed before the import and just got new items — those stay).
    for (const catId of catIds) {
      const { count, error } = await admin
        .from('restaurant_menu_items')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('category_id', catId);
      if (error) return { ok: false, error: error.message };
      if ((count ?? 0) === 0) {
        await admin
          .from('restaurant_menu_categories')
          .delete()
          .eq('tenant_id', tenantId)
          .eq('id', catId);
      }
    }
  }
  return { ok: true };
}
