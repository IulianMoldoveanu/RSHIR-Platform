'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';

export async function setTipForDelivery(
  delivery_id: string,
  amount_ron: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isFinite(amount_ron) || amount_ron < 0 || amount_ron > 1000) {
    return { ok: false, error: 'Suma bacșișului trebuie să fie între 0 și 1000 RON' };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  if (amount_ron === 0) {
    // 0 = remove (avoid storing useless rows).
    const { error } = await sb
      .from('courier_tips')
      .delete()
      .eq('delivery_id', delivery_id)
      .eq('courier_user_id', user.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/dashboard/earnings');
    return { ok: true };
  }

  // Upsert (one tip per delivery — unique constraint).
  const { error } = await sb
    .from('courier_tips')
    .upsert(
      {
        delivery_id,
        courier_user_id: user.id,
        amount_ron,
        recorded_at: new Date().toISOString(),
      },
      { onConflict: 'delivery_id' },
    );

  if (error) return { ok: false, error: error.message };
  revalidatePath('/dashboard/earnings');
  return { ok: true };
}
