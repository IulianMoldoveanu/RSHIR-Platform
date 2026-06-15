'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';

async function requireAdmin() {
  const supa = await createServerClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user?.email || !isPlatformAdminEmail(user.email)) {
    return { ok: false as const, error: 'forbidden' };
  }
  return { ok: true as const, userId: user.id, email: user.email };
}

export async function toggleZoneActiveAction(args: { zoneId: string; active: boolean }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('pricing_zones')
    .update({ active: args.active })
    .eq('id', args.zoneId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/dashboard/admin/cities');
  revalidatePath('/dashboard/admin/cities/[slug]/zones', 'page');
  return { ok: true as const };
}

export async function updateZoneFeesAction(args: {
  zoneId: string;
  restaurant_fee_cents: number;
  courier_payout_cents: number;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (args.restaurant_fee_cents < 0 || args.courier_payout_cents < 0) {
    return { ok: false as const, error: 'Tarif invalid' };
  }
  if (args.courier_payout_cents > args.restaurant_fee_cents) {
    return { ok: false as const, error: 'Plata curier nu poate fi mai mare decat taxa restaurantului.' };
  }
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('pricing_zones')
    .update({
      restaurant_fee_cents: args.restaurant_fee_cents,
      courier_payout_cents: args.courier_payout_cents,
    })
    .eq('id', args.zoneId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/dashboard/admin/cities/[slug]/zones', 'page');
  return { ok: true as const };
}

export async function deleteZoneAction(args: { zoneId: string }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('pricing_zones')
    .delete()
    .eq('id', args.zoneId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/dashboard/admin/cities/[slug]/zones', 'page');
  return { ok: true as const };
}
