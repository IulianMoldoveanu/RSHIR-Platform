'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkPlatformAdmin } from '@/lib/platform-admin';
import { getFleetManagerContext } from '@/lib/fleet-manager';

export type ActionResult = { ok: true } | { ok: false; error: string };

const VALID_STATUS = ['NEW', 'TRIAGED', 'RESOLVED', 'DISMISSED'];

/**
 * Triage a courier feedback row (suggestion / bug).
 *
 * Authorised for platform admins (any fleet) OR the fleet manager who owns the
 * fleet the feedback came from. Runs via the service role and enforces the
 * authorisation in code, so courier_feedback needs no UPDATE RLS policy.
 */
export async function updateFeedbackStatusAction(formData: FormData): Promise<ActionResult> {
  const id = (formData.get('id') as string | null)?.trim() ?? '';
  const status = (formData.get('status') as string | null)?.trim() ?? '';
  if (!id) return { ok: false, error: 'ID lipsă.' };
  if (!VALID_STATUS.includes(status)) return { ok: false, error: 'Status invalid.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;

  const { data: row, error: rowErr } = await sb
    .from('courier_feedback')
    .select('id, fleet_id')
    .eq('id', id)
    .maybeSingle();
  if (rowErr) return { ok: false, error: rowErr.message };
  if (!row) return { ok: false, error: 'Feedback inexistent.' };

  // Authorise: platform admin (any) OR the owning fleet manager.
  let actorId: string;
  const admin = await checkPlatformAdmin();
  if ('userId' in admin) {
    actorId = admin.userId;
  } else {
    const ctx = await getFleetManagerContext();
    if (!ctx || ctx.fleetId !== row.fleet_id) {
      return { ok: false, error: 'Acces interzis.' };
    }
    actorId = ctx.userId;
  }

  const resolved = status === 'RESOLVED' || status === 'DISMISSED';
  const { error } = await sb
    .from('courier_feedback')
    .update({
      status,
      resolved_by: resolved ? actorId : null,
      resolved_at: resolved ? new Date().toISOString() : null,
    })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/feedback');
  revalidatePath('/fleet/feedback');
  return { ok: true };
}
