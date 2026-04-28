'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
  await admin
    .from('courier_orders')
    .update({ status: 'PICKED_UP', updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('assigned_courier_user_id', userId);
  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath('/dashboard/orders');
}

export async function markDeliveredAction(orderId: string) {
  const userId = await requireUserId();
  const admin = createAdminClient();
  await admin
    .from('courier_orders')
    .update({ status: 'DELIVERED', updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('assigned_courier_user_id', userId);
  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath('/dashboard/orders');
}

export async function acceptOrderAction(orderId: string) {
  const userId = await requireUserId();
  const admin = createAdminClient();
  // Only accept if currently CREATED or OFFERED and unassigned.
  await admin
    .from('courier_orders')
    .update({
      status: 'ACCEPTED',
      assigned_courier_user_id: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .in('status', ['CREATED', 'OFFERED'])
    .is('assigned_courier_user_id', null);
  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath('/dashboard/orders');
}
