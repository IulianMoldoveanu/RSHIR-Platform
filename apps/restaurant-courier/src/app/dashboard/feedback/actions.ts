'use server';

import { createServerClient } from '@/lib/supabase/server';
import { createAdminClientUntyped } from '@/lib/supabase/admin';

export type SubmitFeedbackResult = { ok: true } | { ok: false; error: string };

const MAX_MESSAGE = 2000;

/**
 * Submit a courier suggestion or bug report.
 *
 * The courier's current fleet is denormalised onto the row so a fleet manager
 * can triage their own riders' feedback without a join (and the attribution
 * survives a later transfer).
 */
export async function submitFeedbackAction(formData: FormData): Promise<SubmitFeedbackResult> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesiunea a expirat. Reconectează-te.' };

  const kind = (formData.get('kind') as string | null)?.trim() ?? '';
  const message = (formData.get('message') as string | null)?.trim() ?? '';
  const platform = (formData.get('platform') as string | null)?.trim() || null;
  const appVersion = (formData.get('app_version') as string | null)?.trim() || null;

  if (kind !== 'SUGGESTION' && kind !== 'BUG') {
    return { ok: false, error: 'Tip invalid.' };
  }
  if (message.length < 5) {
    return { ok: false, error: 'Scrie cel puțin câteva cuvinte.' };
  }
  if (message.length > MAX_MESSAGE) {
    return { ok: false, error: `Mesajul e prea lung (max ${MAX_MESSAGE} caractere).` };
  }

  const admin = createAdminClientUntyped();

  const { data: profile } = await admin
    .from('courier_profiles')
    .select('fleet_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const { error } = await admin.from('courier_feedback').insert({
    courier_user_id: user.id,
    fleet_id: profile?.fleet_id ?? null,
    kind,
    message,
    platform,
    app_version: appVersion,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
