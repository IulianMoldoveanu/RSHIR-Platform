'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTenantMember, getActiveTenant } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';

const settingsSchema = z.object({
  tenantId: z.string().uuid(),
  is_enabled: z.boolean(),
  points_per_ron: z.number().min(0).max(100),
  ron_per_point: z.number().min(0).max(10),
  min_points_to_redeem: z.number().int().min(1).max(100000),
  max_redemption_pct: z.number().int().min(1).max(100),
  expiry_days: z.number().int().min(0).max(3650),
  welcome_bonus_points: z.number().int().min(0).max(100000),
});

export type LoyaltyActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateLoyaltySettings(
  raw: unknown,
): Promise<LoyaltyActionResult> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Trebuie să fiți autentificat.' };

  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'Date invalide.' };
  }
  const { tenantId, ...rest } = parsed.data;

  const { tenant } = await getActiveTenant();
  if (tenant.id !== tenantId) {
    return { ok: false, error: 'Tenant mismatch.' };
  }
  await assertTenantMember(user.id, tenant.id);

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { error } = await sb
    .from('loyalty_settings')
    .upsert({ tenant_id: tenantId, ...rest, updated_at: new Date().toISOString() });
  if (error) {
    return { ok: false, error: error.message };
  }

  await logAudit({
    tenantId,
    actorUserId: user.id,
    action: 'loyalty.settings_updated',
    entityType: 'loyalty_settings',
    entityId: tenantId,
    metadata: rest,
  });

  revalidatePath('/dashboard/settings/loyalty');
  return { ok: true };
}
