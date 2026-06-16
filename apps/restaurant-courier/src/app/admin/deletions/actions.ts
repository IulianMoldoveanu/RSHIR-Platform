'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClientUntyped } from '@/lib/supabase/admin';
import { checkPlatformAdmin } from '@/lib/platform-admin';
import { getFleetManagerContext } from '@/lib/fleet-manager';

export type ActionResult = { ok: true } | { ok: false; error: string };

const RETENTION_DAYS = 30;

/**
 * Approve or reject a courier account-deletion request.
 *
 * Authorised for platform admins (any) OR a fleet manager who (a) owns the
 * fleet the request came from AND (b) was granted can_approve_deletions by a
 * platform admin. On APPROVE the data is held until requested_at + 30 days
 * (scheduled_purge_at) and the nightly purge job anonymises it then. On REJECT
 * the request is closed and the account is restored to INACTIVE.
 */
export async function decideDeletionAction(formData: FormData): Promise<ActionResult> {
  const id = (formData.get('id') as string | null)?.trim() ?? '';
  const decision = (formData.get('decision') as string | null)?.trim() ?? '';
  const note = (formData.get('note') as string | null)?.trim() || null;
  if (!id) return { ok: false, error: 'ID lipsă.' };
  if (decision !== 'APPROVE' && decision !== 'REJECT') {
    return { ok: false, error: 'Decizie invalidă.' };
  }

  const sb = createAdminClientUntyped();

  const { data: req, error: reqErr } = await sb
    .from('courier_account_deletion_requests')
    .select('id, courier_user_id, fleet_id, status, requested_at')
    .eq('id', id)
    .maybeSingle();
  if (reqErr) return { ok: false, error: reqErr.message };
  if (!req) return { ok: false, error: 'Cerere inexistentă.' };
  if (req.status !== 'PENDING') return { ok: false, error: 'Cererea a fost deja procesată.' };

  // Authorise: platform admin OR the permissioned owning fleet manager.
  let actorId: string;
  const admin = await checkPlatformAdmin();
  if ('userId' in admin) {
    actorId = admin.userId;
  } else {
    const ctx = await getFleetManagerContext();
    if (!ctx || ctx.fleetId !== req.fleet_id) return { ok: false, error: 'Acces interzis.' };
    const { data: fleet } = await sb
      .from('courier_fleets')
      .select('can_approve_deletions')
      .eq('id', ctx.fleetId)
      .maybeSingle();
    if (!fleet?.can_approve_deletions) {
      return { ok: false, error: 'Flota ta nu are permisiune de aprobare a ștergerilor.' };
    }
    actorId = ctx.userId;
  }

  const nowIso = new Date().toISOString();

  if (decision === 'APPROVE') {
    const purgeAt = new Date(
      new Date(req.requested_at).getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    // Audit B18 (TOCTOU): guard the UPDATE on status='PENDING' so two
    // approvers who load the queue simultaneously can't both flip the same
    // request (the SELECT above is non-locking — the second approver would
    // race past the status check and overwrite the winner's review_by/note).
    const { data: updated, error } = await sb
      .from('courier_account_deletion_requests')
      .update({
        status: 'APPROVED',
        reviewed_by: actorId,
        reviewed_at: nowIso,
        review_note: note,
        scheduled_purge_at: purgeAt,
      })
      .eq('id', id)
      .eq('status', 'PENDING')
      .select('id')
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!updated) return { ok: false, error: 'Cererea a fost deja procesată.' };
  } else {
    // REJECT: deny erasure, close the request, restore the account.
    // Same TOCTOU guard as APPROVE — only the winner flips the row.
    const { data: updated, error } = await sb
      .from('courier_account_deletion_requests')
      .update({
        status: 'REJECTED',
        reviewed_by: actorId,
        reviewed_at: nowIso,
        review_note: note,
        completed_at: nowIso,
      })
      .eq('id', id)
      .eq('status', 'PENDING')
      .select('id')
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!updated) return { ok: false, error: 'Cererea a fost deja procesată.' };
    await sb
      .from('courier_profiles')
      .update({ status: 'INACTIVE', deletion_requested_at: null })
      .eq('user_id', req.courier_user_id);
  }

  revalidatePath('/admin/deletions');
  revalidatePath('/fleet/deletions');
  return { ok: true };
}

/**
 * Grant / revoke a fleet manager's permission to approve deletions for their
 * own fleet. Platform-admin only.
 */
export async function setFleetCanApproveDeletionsAction(formData: FormData): Promise<ActionResult> {
  const admin = await checkPlatformAdmin();
  if ('error' in admin) return { ok: false, error: admin.error };

  const fleetId = (formData.get('fleet_id') as string | null)?.trim() ?? '';
  const enabled = (formData.get('enabled') as string | null) === 'true';
  if (!fleetId) return { ok: false, error: 'Flotă lipsă.' };

  const sb = createAdminClientUntyped();
  const { error } = await sb
    .from('courier_fleets')
    .update({ can_approve_deletions: enabled })
    .eq('id', fleetId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/deletions');
  return { ok: true };
}
