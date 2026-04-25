'use server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';

export type NotificationsActionResult = {
  ok: boolean;
  enabled?: boolean;
  error?: 'forbidden_owner_only' | 'unauthenticated' | 'tenant_mismatch' | 'db_error';
  detail?: string;
};

// RSHIR-37 M-2: callers pass the tenantId rendered server-side; refuse the
// write when the cookie-derived active tenant has drifted (multi-tenant
// tab race). Same pattern RSHIR-26 / RSHIR-32 already applied elsewhere.
async function setSettingsKey(
  expectedTenantId: string,
  key: 'email_notifications_enabled' | 'daily_digest_enabled',
  enabled: boolean,
  revalidate: string,
): Promise<NotificationsActionResult> {
  if (!expectedTenantId) return { ok: false, error: 'tenant_mismatch' };
  const { user, tenant } = await getActiveTenant().catch(() => ({
    user: null,
    tenant: null,
  }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (tenant.id !== expectedTenantId) return { ok: false, error: 'tenant_mismatch' };
  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  const admin = createAdminClient();
  const { data: row, error: readErr } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', expectedTenantId)
    .maybeSingle();
  if (readErr) return { ok: false, error: 'db_error', detail: readErr.message };

  const next = {
    ...((row?.settings as Record<string, unknown> | null) ?? {}),
    [key]: enabled,
  };
  const { error } = await admin
    .from('tenants')
    .update({ settings: next as never })
    .eq('id', expectedTenantId);
  if (error) return { ok: false, error: 'db_error', detail: error.message };

  revalidatePath(revalidate);
  return { ok: true, enabled };
}

export async function setEmailNotificationsAction(
  enabled: boolean,
  expectedTenantId: string,
): Promise<NotificationsActionResult> {
  return setSettingsKey(
    expectedTenantId,
    'email_notifications_enabled',
    enabled,
    '/dashboard/settings/notifications',
  );
}

export async function setDailyDigestEnabledAction(
  enabled: boolean,
  expectedTenantId: string,
): Promise<NotificationsActionResult> {
  return setSettingsKey(
    expectedTenantId,
    'daily_digest_enabled',
    enabled,
    '/dashboard/settings/notifications',
  );
}
