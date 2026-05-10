'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTenantMember, getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';
import { PRE_ORDER_INPUT_BOUNDS } from './settings';

const settingsSchema = z.object({
  enabled: z.boolean(),
  min_advance_hours: z
    .number()
    .int()
    .min(PRE_ORDER_INPUT_BOUNDS.min_advance_hours.min)
    .max(PRE_ORDER_INPUT_BOUNDS.min_advance_hours.max),
  max_advance_days: z
    .number()
    .int()
    .min(PRE_ORDER_INPUT_BOUNDS.max_advance_days.min)
    .max(PRE_ORDER_INPUT_BOUNDS.max_advance_days.max),
  min_subtotal_ron: z
    .number()
    .min(PRE_ORDER_INPUT_BOUNDS.min_subtotal_ron.min)
    .max(PRE_ORDER_INPUT_BOUNDS.min_subtotal_ron.max),
});

export type SavePreOrderSettingsInput = z.infer<typeof settingsSchema>;

/**
 * OWNER-only. Persists pre-order settings under tenants.settings.pre_orders
 * (jsonb merge — preserves all other keys like smartbill, branding, etc.).
 */
export async function savePreOrderSettings(
  expectedTenantId: string,
  input: SavePreOrderSettingsInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!expectedTenantId) return { ok: false, error: 'missing_tenant_id' };
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const { tenant } = await getActiveTenant();
  if (tenant.id !== expectedTenantId) return { ok: false, error: 'tenant_mismatch' };

  await assertTenantMember(user.id, expectedTenantId);
  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const admin = createAdminClient();
  const { data: tenantRow, error: readErr } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', expectedTenantId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };

  const current = (tenantRow?.settings as Record<string, unknown> | null) ?? {};
  const next = {
    ...current,
    pre_orders: {
      enabled: parsed.data.enabled,
      min_advance_hours: parsed.data.min_advance_hours,
      max_advance_days: parsed.data.max_advance_days,
      min_subtotal_ron: parsed.data.min_subtotal_ron,
    },
  };

  const { error: updErr } = await admin
    .from('tenants')
    .update({ settings: next as never })
    .eq('id', expectedTenantId);
  if (updErr) return { ok: false, error: updErr.message };

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: user.id,
    action: 'pre_orders.settings_updated',
    entityType: 'tenant',
    entityId: expectedTenantId,
    metadata: parsed.data,
  });

  revalidatePath('/dashboard/pre-orders');
  return { ok: true };
}
