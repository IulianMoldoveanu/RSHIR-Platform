'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTenantMember, getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';

const scheduleSchema = z.object({
  enabled: z.boolean(),
  delivery_hour_local: z.number().int().min(0).max(23),
});

export type UpdateBriefScheduleResult =
  | { ok: true }
  | { ok: false; error: string };

// OWNER-only: turn the daily brief on/off and pick the local hour. Resets
// consecutive_skips when the operator re-enables — the auto-pause guard
// should not keep an operator who just acted from receiving the brief.
export async function updateBriefSchedule(
  expectedTenantId: string,
  raw: { enabled: boolean; delivery_hour_local: number },
): Promise<UpdateBriefScheduleResult> {
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

  const parsed = scheduleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const admin = createAdminClient();
  // copilot_brief_schedules is not in generated types yet — same any-cast
  // pattern as the read-side queries.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { error } = await sb
    .from('copilot_brief_schedules')
    .upsert(
      {
        tenant_id: expectedTenantId,
        enabled: parsed.data.enabled,
        delivery_hour_local: parsed.data.delivery_hour_local,
        // Re-arming the brief should clear the auto-pause counter. If the
        // operator merely changed the hour without flipping enabled, this
        // is still safe — they are clearly engaged.
        consecutive_skips: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id' },
    );
  if (error) {
    console.error('[ai-ceo/actions] updateBriefSchedule failed', error.message);
    return { ok: false, error: 'db_error' };
  }

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: user.id,
    action: 'ai_ceo.brief_schedule_updated',
    metadata: {
      enabled: parsed.data.enabled,
      delivery_hour_local: parsed.data.delivery_hour_local,
    },
  });

  revalidatePath('/dashboard/ai-ceo');
  return { ok: true };
}

const suggestionActionSchema = z.object({
  runId: z.string().uuid(),
  index: z.number().int().min(0).max(20),
  status: z.enum(['approved', 'rejected']),
});

export type SetSuggestionStatusResult =
  | { ok: true }
  | { ok: false; error: string };

// OWNER-only: flip suggestion_status[index] on a copilot_agent_runs row. The
// row's tenant is verified by including restaurant_id in the WHERE clause —
// a caller cannot mutate another tenant's run even if they guess the runId.
export async function setSuggestionStatus(
  expectedTenantId: string,
  raw: { runId: string; index: number; status: 'approved' | 'rejected' },
): Promise<SetSuggestionStatusResult> {
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

  const parsed = suggestionActionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { runId, index, status } = parsed.data;

  const admin = createAdminClient();
  // copilot_agent_runs is not in generated types — same any-cast pattern.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  // Read the current suggestion_status array, scoped by tenant. Returning a
  // single row also confirms the run exists for this tenant.
  const { data: row, error: readErr } = await sb
    .from('copilot_agent_runs')
    .select('suggestion_status')
    .eq('id', runId)
    .eq('restaurant_id', expectedTenantId)
    .maybeSingle();
  if (readErr) {
    console.error('[ai-ceo/actions] setSuggestionStatus read failed', readErr.message);
    return { ok: false, error: 'db_error' };
  }
  if (!row) return { ok: false, error: 'not_found' };

  const current = Array.isArray(row.suggestion_status)
    ? [...(row.suggestion_status as string[])]
    : [];
  if (index >= current.length) return { ok: false, error: 'invalid_input' };
  current[index] = status;

  const { error: writeErr } = await sb
    .from('copilot_agent_runs')
    .update({ suggestion_status: current })
    .eq('id', runId)
    .eq('restaurant_id', expectedTenantId);
  if (writeErr) {
    console.error('[ai-ceo/actions] setSuggestionStatus update failed', writeErr.message);
    return { ok: false, error: 'db_error' };
  }

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: user.id,
    action: 'ai_ceo.suggestion_acted',
    entityType: 'copilot_agent_run',
    entityId: runId,
    metadata: { index, status },
  });

  revalidatePath('/dashboard/ai-ceo');
  return { ok: true };
}
