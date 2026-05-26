'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';

export async function resolveOpsAlertAction(
  alertId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supa = await createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user?.email || !isPlatformAdminEmail(user.email)) {
    return { ok: false, error: 'forbidden' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { error } = await admin
    .from('ops_alerts')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', alertId)
    .is('resolved_at', null);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/admin/control-room');
  return { ok: true };
}
