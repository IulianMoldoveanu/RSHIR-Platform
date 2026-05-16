'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';

export type ToggleResult =
  | { ok: true; enabled: boolean }
  | { ok: false; error: string };

export async function togglePoweredByHir(_prev: ToggleResult | null, formData: FormData): Promise<ToggleResult> {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);
  if (role !== 'OWNER') {
    return { ok: false, error: 'Doar proprietarul poate schimba această setare.' };
  }

  const desired = formData.get('enabled') === 'true';

  // Cast through any — column not yet in generated supabase-types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { error } = await admin
    .from('tenants')
    .update({ powered_by_hir_badge: desired })
    .eq('id', tenant.id);

  if (error) {
    console.error('[storefront-attribution] toggle failed:', error.message);
    return { ok: false, error: 'Nu am putut salva. Încearcă din nou.' };
  }

  void logAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: 'storefront.badge_toggled',
    entityType: 'tenant',
    entityId: tenant.id,
    metadata: { enabled: desired },
  });

  revalidatePath('/dashboard/settings/storefront-attribution');
  revalidatePath('/dashboard/settings');
  return { ok: true, enabled: desired };
}
