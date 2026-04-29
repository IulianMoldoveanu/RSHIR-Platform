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
