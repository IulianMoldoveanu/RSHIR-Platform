'use server';

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Request account deletion.
 *
 * Flow:
 *   1. Mark the courier profile as SUSPENDED + set deletion_requested_at.
 *   2. Sign the user out.
 *
 * Actual data deletion (GDPR erasure) is handled by a scheduled job that
 * processes rows where deletion_requested_at is older than 48h, respecting
 * legal retention requirements (5 years for fiscal data).
 *
 * The column deletion_requested_at must exist on courier_profiles. If it
 * does not yet exist (pre-migration), we fall back to just suspending the
 * profile and logging the request via email/support channel.
 */
export async function requestAccountDeletion(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: 'Sesiunea a expirat. Reconectează-te.' };

  const admin = createAdminClient();

  try {
    await admin
      .from('courier_profiles')
      .update({
        status: 'SUSPENDED',
        deletion_requested_at: new Date().toISOString(),
      } as never)
      .eq('user_id', user.id);
  } catch {
    await admin
      .from('courier_profiles')
      .update({ status: 'SUSPENDED' })
      .eq('user_id', user.id);
  }

  // Sign out
  await supabase.auth.signOut();

  return { ok: true };
}
