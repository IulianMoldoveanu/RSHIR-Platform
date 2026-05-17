'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';

export type VoiceOrderActionResult =
  | { ok: true }
  | { ok: false; error: string };

async function requireTenantStaff(
  expectedTenantId: string,
): Promise<{ userId: string; tenantId: string }> {
  if (!expectedTenantId) throw new Error('missing_tenant_id');
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('unauthenticated');
  const { tenant } = await getActiveTenant();
  if (tenant.id !== expectedTenantId) throw new Error('tenant_mismatch');
  const role = await getTenantRole(user.id, expectedTenantId);
  if (!role) throw new Error('forbidden');
  return { userId: user.id, tenantId: expectedTenantId };
}

async function loadVoiceOrder(
  orderId: string,
  tenantId: string,
): Promise<{ id: string; tenant_id: string; status: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('restaurant_orders')
    .select('id, tenant_id, status')
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .eq('source', 'VOICE' as any)
    .maybeSingle();
  if (error) throw new Error(`db_error: ${error.message}`);
  if (!data) throw new Error('not_found');
  return data as { id: string; tenant_id: string; status: string };
}

export async function approveVoiceOrder(
  orderId: string,
  expectedTenantId: string,
): Promise<VoiceOrderActionResult> {
  try {
    const { userId, tenantId } = await requireTenantStaff(expectedTenantId);
    const order = await loadVoiceOrder(orderId, tenantId);
    if (order.status !== 'PENDING') {
      return { ok: false, error: 'invalid_status' };
    }
    const admin = createAdminClient();
    const { error } = await admin
      .from('restaurant_orders')
      .update({ status: 'CONFIRMED' })
      .eq('id', orderId)
      .eq('tenant_id', tenantId);
    if (error) return { ok: false, error: `db_error: ${error.message}` };
    await logAudit({
      tenantId,
      actorUserId: userId,
      action: 'order.voice_created',
      entityType: 'order',
      entityId: orderId,
      metadata: { action: 'approved', from: 'PENDING', to: 'CONFIRMED' },
    });
    revalidatePath('/dashboard/voice');
    revalidatePath('/dashboard/orders');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }
}

export async function rejectVoiceOrder(
  orderId: string,
  expectedTenantId: string,
): Promise<VoiceOrderActionResult> {
  try {
    const { userId, tenantId } = await requireTenantStaff(expectedTenantId);
    const order = await loadVoiceOrder(orderId, tenantId);
    if (order.status !== 'PENDING') {
      return { ok: false, error: 'invalid_status' };
    }
    const admin = createAdminClient();
    const { error } = await admin
      .from('restaurant_orders')
      .update({ status: 'CANCELLED' })
      .eq('id', orderId)
      .eq('tenant_id', tenantId);
    if (error) return { ok: false, error: `db_error: ${error.message}` };
    await logAudit({
      tenantId,
      actorUserId: userId,
      action: 'order.voice_created',
      entityType: 'order',
      entityId: orderId,
      metadata: { action: 'rejected', from: 'PENDING', to: 'CANCELLED' },
    });
    revalidatePath('/dashboard/voice');
    revalidatePath('/dashboard/orders');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function editVoiceOrder(orderId: string): never {
  redirect(`/dashboard/orders/${orderId}`);
}
