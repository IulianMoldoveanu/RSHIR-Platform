'use server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';

export type NotificationsActionResult = {
  ok: boolean;
  enabled?: boolean;
  error?: 'forbidden_owner_only' | 'unauthenticated' | 'db_error';
  detail?: string;
};

export async function setEmailNotificationsAction(
  enabled: boolean,
): Promise<NotificationsActionResult> {
  const { user, tenant } = await getActiveTenant().catch(() => ({
    user: null,
    tenant: null,
  }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  const role = await getTenantRole(user.id, tenant.id);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  const admin = createAdminClient();
  const { data: row, error: readErr } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', tenant.id)
    .maybeSingle();
  if (readErr) return { ok: false, error: 'db_error', detail: readErr.message };

  const next = {
    ...(row?.settings as Record<string, unknown> | null ?? {}),
    email_notifications_enabled: enabled,
  };
  const { error } = await admin
    .from('tenants')
    .update({ settings: next })
    .eq('id', tenant.id);
  if (error) return { ok: false, error: 'db_error', detail: error.message };

  revalidatePath('/dashboard/settings/notifications');
  return { ok: true, enabled };
}
