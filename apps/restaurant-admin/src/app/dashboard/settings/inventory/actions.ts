'use server';

// Lane INVENTORY-FOLLOWUP PR 4 (2026-05-07) — OWNER-only server action
// to flip tenants.feature_flags.inventory_enabled. Audited as
// `inventory.feature_toggled_on` / `inventory.feature_toggled_off`.

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';
import { setInventoryEnabled } from '@/lib/inventory';

const schema = z.object({
  enabled: z.enum(['true', 'false']).transform((v) => v === 'true'),
});

export async function toggleInventoryEnabledAction(
  formData: FormData,
): Promise<{ ok: true; enabled: boolean } | { ok: false; error: string }> {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Sesiunea a expirat. Reautentificați-vă.' };

    const { tenant } = await getActiveTenant();
    const role = await getTenantRole(user.id, tenant.id);
    if (role !== 'OWNER') {
      return {
        ok: false,
        error: 'Doar proprietarul restaurantului poate modifica această setare.',
      };
    }

    const { enabled } = schema.parse({ enabled: formData.get('enabled') });

    await setInventoryEnabled(tenant.id, enabled);

    await logAudit({
      tenantId: tenant.id,
      actorUserId: user.id,
      action: enabled ? 'inventory.feature_toggled_on' : 'inventory.feature_toggled_off',
      entityType: 'tenant',
      entityId: tenant.id,
      metadata: {},
    });

    revalidatePath('/dashboard/settings/inventory');
    revalidatePath('/dashboard/settings');
    revalidatePath('/dashboard/inventory');
    revalidatePath('/dashboard/inventory/movements');
    return { ok: true, enabled };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
