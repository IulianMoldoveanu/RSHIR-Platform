'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWebhook } from '@/lib/webhook';
import { logAudit } from '@/lib/audit';

async function notifySubscriber(orderId: string, status: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('courier_orders')
    .select('source_order_id, updated_at')
    .eq('id', orderId)
    .maybeSingle();
  if (!data) return;
  void sendWebhook(orderId, {
    event: 'order.status_changed',
    orderId,
    externalOrderId: (data as { source_order_id: string | null }).source_order_id ?? null,
    status,
    occurredAt: (data as { updated_at: string }).updated_at,
  });
}

export async function logoutAction() {
  const supabase = createServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}

async function requireUserId(): Promise<string> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return user.id;
}

export async function startShiftAction() {
  const userId = await requireUserId();
  const admin = createAdminClient();

  // End any other ONLINE shift first (defensive — should be unique by index).
  await admin
    .from('courier_shifts')
    .update({ status: 'OFFLINE', ended_at: new Date().toISOString() })
    .eq('courier_user_id', userId)
    .eq('status', 'ONLINE');

  await admin.from('courier_shifts').insert({
    courier_user_id: userId,
    started_at: new Date().toISOString(),
    status: 'ONLINE',
  });

  await admin
    .from('courier_profiles')
    .update({ status: 'ACTIVE' })
    .eq('user_id', userId);

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/shift');
}

export async function endShiftAction() {
  const userId = await requireUserId();
  const admin = createAdminClient();

  await admin
    .from('courier_shifts')
    .update({ status: 'OFFLINE', ended_at: new Date().toISOString() })
    .eq('courier_user_id', userId)
    .eq('status', 'ONLINE');

  await admin
    .from('courier_profiles')
    .update({ status: 'INACTIVE' })
    .eq('user_id', userId);

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/shift');
}

export async function markPickedUpAction(orderId: string) {
  const userId = await requireUserId();
  const admin = createAdminClient();
  const { data } = await admin
    .from('courier_orders')
    .update({ status: 'PICKED_UP', updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('assigned_courier_user_id', userId)
    .select('id')
    .maybeSingle();
  if (data) await notifySubscriber(orderId, 'PICKED_UP');
  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath('/dashboard/orders');
}

export async function markDeliveredAction(
  orderId: string,
  proofUrl?: string,
  cashCollected?: boolean,
) {
  const userId = await requireUserId();
  const admin = createAdminClient();
  const update: Record<string, unknown> = {
    status: 'DELIVERED',
    updated_at: new Date().toISOString(),
  };
  if (proofUrl) {
    update.delivered_proof_url = proofUrl;
    update.delivered_proof_taken_at = new Date().toISOString();
  }
  const { data } = await admin
    .from('courier_orders')
    .update(update)
    .eq('id', orderId)
    .eq('assigned_courier_user_id', userId)
    .select('id, payment_method, total_ron')
    .maybeSingle();
  if (data) {
    // For cash-on-delivery orders, log the courier-confirmed cash collection
    // as an audit event. Settlement reconciliation reads this trail to verify
    // expected cash deposits per courier per shift.
    const row = data as { id: string; payment_method: 'CARD' | 'COD' | null; total_ron: number | null };
    if (row.payment_method === 'COD' && cashCollected) {
      await logAudit({
        actorUserId: userId,
        action: 'order.cash_collected',
        entityType: 'courier_order',
        entityId: row.id,
        metadata: {
          total_ron: row.total_ron,
          confirmed_at: new Date().toISOString(),
        },
      });
    }
    await notifySubscriber(orderId, 'DELIVERED');
  }
  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath('/dashboard/orders');
}

export async function refreshOrdersAction() {
  revalidatePath('/dashboard/orders');
}

/**
 * Persists the courier's last-known geolocation onto their currently-ONLINE
 * shift row (`courier_shifts.last_lat / last_lng / last_seen_at`). No-op if
 * the courier has no ONLINE shift — we never write a fix without an active
 * shift, both for privacy and for the obvious "they're not working" reason.
 *
 * Best-effort: silently ignores DB errors. The client-side watcher continues
 * to stream fixes, so a single-failed write is recovered on the next interval.
 */
export async function updateCourierLocationAction(lat: number, lng: number): Promise<void> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

  const userId = await requireUserId();
  const admin = createAdminClient();

  await admin
    .from('courier_shifts')
    .update({
      last_lat: lat,
      last_lng: lng,
      last_seen_at: new Date().toISOString(),
    })
    .eq('courier_user_id', userId)
    .eq('status', 'ONLINE');
}

export async function acceptOrderAction(orderId: string) {
  const userId = await requireUserId();
  const admin = createAdminClient();
  // Only accept if currently CREATED or OFFERED and unassigned.
  const { data } = await admin
    .from('courier_orders')
    .update({
      status: 'ACCEPTED',
      assigned_courier_user_id: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .in('status', ['CREATED', 'OFFERED'])
    .is('assigned_courier_user_id', null)
    .select('id')
    .maybeSingle();
  if (data) await notifySubscriber(orderId, 'ACCEPTED');
  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath('/dashboard/orders');
}
