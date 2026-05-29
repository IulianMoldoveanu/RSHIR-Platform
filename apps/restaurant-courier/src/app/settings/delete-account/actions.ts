'use server';

import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Request account deletion.
 *
 * Flow:
 *   1. Mark the courier profile as SUSPENDED + set deletion_requested_at.
 *   2. POST to the courier-delete-account-confirm Edge Function which writes
 *      an audit row in courier_account_deletion_requests and sends a Resend
 *      confirmation email to the courier ("vei primi confirmare pe email").
 *   3. Sign the user out.
 *
 * Actual data deletion (GDPR erasure) is handled by a scheduled job that
 * processes rows where deletion_requested_at is older than 30 days, respecting
 * legal retention requirements (5 years for fiscal data).
 *
 * The column deletion_requested_at must exist on courier_profiles. If it
 * does not yet exist (pre-migration), we fall back to just suspending the
 * profile and the audit row still records the request via the Edge Function.
 */
export async function requestAccountDeletion(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) return { ok: false, error: 'Sesiunea a expirat. Reconectează-te.' };

  const admin = createAdminClient();
  const requestedAt = new Date().toISOString();

  try {
    await admin
      .from('courier_profiles')
      .update({
        status: 'SUSPENDED',
        deletion_requested_at: requestedAt,
      } as never)
      .eq('user_id', user.id);
  } catch {
    await admin
      .from('courier_profiles')
      .update({ status: 'SUSPENDED' })
      .eq('user_id', user.id);
  }

  // Best-effort confirmation email + audit row via Edge Function. Failure
  // here must not block sign-out — the courier_profile is already suspended
  // and the deletion_requested_at is the legal source of truth.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    const { data: session } = await supabase.auth.getSession();
    const accessToken = session.session?.access_token;
    if (accessToken) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/courier-delete-account-confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            courier_email: user.email ?? null,
            requested_at: requestedAt,
          }),
        });
      } catch (e) {
        console.warn('[delete-account] confirm-email call failed', e);
      }
    }
  }

  // Sign out
  await supabase.auth.signOut();

  return { ok: true };
}
