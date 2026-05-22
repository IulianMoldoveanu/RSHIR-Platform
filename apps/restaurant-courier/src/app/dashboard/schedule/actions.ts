'use server';

// Migrated 2026-05-22 from mailto+localStorage to DB-backed slots (see PR #716 schema)
//
// Supabase client is cast to `any` for chained queries — matches codebase
// pattern (see apps/restaurant-courier/src/app/admin/observability/courier-health/page.tsx
// and apps/restaurant-admin/src/app/dashboard/admin/control-room/page.tsx) which works
// around the @supabase/ssr@0.5.2 + supabase-js typing mismatch.

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';

export type ShiftSlot = {
  id: string;
  courier_user_id: string;
  slot_start: string;
  slot_end: string;
  status:
    | 'REQUESTED'
    | 'ACTIVE'
    | 'REQUESTED_CHANGE'
    | 'SUPERSEDED'
    | 'REJECTED'
    | 'CANCELLED';
  prev_slot_id: string | null;
  courier_note: string | null;
  created_at: string;
  updated_at: string;
};

export async function listMySlots(week_start: string): Promise<ShiftSlot[]> {
  const supabase = await createServerClient();
  const week_end = new Date(new Date(week_start).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data, error } = await sb
    .from('courier_shift_slots')
    .select(
      'id, courier_user_id, slot_start, slot_end, status, prev_slot_id, courier_note, created_at, updated_at',
    )
    .gte('slot_start', week_start)
    .lt('slot_start', week_end)
    .order('slot_start', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ShiftSlot[];
}

export async function createShiftSlot(
  slot_start: string,
  slot_end: string,
  courier_note?: string,
): Promise<{ id: string }> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: inserted, error: insertErr } = await sb
    .from('courier_shift_slots')
    .insert({
      courier_user_id: user.id,
      slot_start,
      slot_end,
      status: 'REQUESTED',
      courier_note: courier_note ?? null,
    })
    .select('id')
    .single();

  if (insertErr) throw new Error(insertErr.message);

  // Immediately promote to ACTIVE — creation requires no admin action.
  const { error: updateErr } = await sb
    .from('courier_shift_slots')
    .update({ status: 'ACTIVE' })
    .eq('id', inserted.id);

  if (updateErr) throw new Error(updateErr.message);

  revalidatePath('/dashboard/schedule');
  return { id: inserted.id };
}

export async function requestSlotChange(
  slot_id: string,
  new_start: string,
  new_end: string,
  reason?: string,
): Promise<{ new_slot_id: string }> {
  const supabase = await createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data, error } = await sb.rpc('request_slot_change', {
    p_slot_id: slot_id,
    p_new_start: new_start,
    p_new_end: new_end,
    p_reason: reason ?? null,
  });

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/schedule');
  return { new_slot_id: data as string };
}

export async function cancelSlot(slot_id: string): Promise<void> {
  const supabase = await createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { error } = await sb
    .from('courier_shift_slots')
    .update({ status: 'CANCELLED' })
    .eq('id', slot_id);

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/schedule');
}
