'use server';

// Migrated 2026-05-22 from mailto+localStorage to DB-backed slots (see PR #716 schema)

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

/**
 * List slots for the current courier between week_start and +7 days.
 * week_start must be an ISO string (midnight local time rendered as UTC).
 */
export async function listMySlots(week_start: string): Promise<ShiftSlot[]> {
  const supabase = await createServerClient();
  const week_end = new Date(new Date(week_start).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
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

/**
 * Create a new availability slot for one hour block.
 * Default status in DB is REQUESTED; this action immediately promotes it
 * to ACTIVE (no admin approval needed at creation — only modifications
 * go through the approval workflow per PR #716 state machine).
 */
export async function createShiftSlot(
  slot_start: string,
  slot_end: string,
  courier_note?: string,
): Promise<{ id: string }> {
  const supabase = await createServerClient();

  const { data: inserted, error: insertErr } = await supabase
    .from('courier_shift_slots')
    .insert({
      slot_start,
      slot_end,
      status: 'REQUESTED',
      courier_note: courier_note ?? null,
    })
    .select('id')
    .single();

  if (insertErr) throw new Error(insertErr.message);

  // Immediately promote to ACTIVE — creation requires no admin action.
  const { error: updateErr } = await supabase
    .from('courier_shift_slots')
    .update({ status: 'ACTIVE' })
    .eq('id', inserted.id);

  if (updateErr) throw new Error(updateErr.message);

  revalidatePath('/dashboard/schedule');
  return { id: inserted.id };
}

/**
 * Request a change to an ACTIVE slot. Uses the RPC from PR #716
 * which inserts a REQUESTED_CHANGE row while keeping the old row ACTIVE
 * until admin approves or rejects.
 */
export async function requestSlotChange(
  slot_id: string,
  new_start: string,
  new_end: string,
  reason?: string,
): Promise<{ new_slot_id: string }> {
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('request_slot_change', {
    p_slot_id: slot_id,
    p_new_start: new_start,
    p_new_end: new_end,
    p_reason: reason ?? null,
  });

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/schedule');
  return { new_slot_id: data as string };
}

/**
 * Cancel an ACTIVE or REQUESTED slot. RLS enforces courier_user_id = auth.uid()
 * and status must become CANCELLED (any other status transition is rejected).
 */
export async function cancelSlot(slot_id: string): Promise<void> {
  const supabase = await createServerClient();

  const { error } = await supabase
    .from('courier_shift_slots')
    .update({ status: 'CANCELLED' })
    .eq('id', slot_id);

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/schedule');
}
