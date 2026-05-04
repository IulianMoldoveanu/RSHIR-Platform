'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getFleetManagerContext } from '@/lib/fleet-manager';
import { logAudit } from '@/lib/audit';

export type FleetActionResult = { ok: true } | { ok: false; error: string };

// E.164 sanity: must start with +, then 8–15 digits. We don't try to parse
// further — the column is treated as a free-form display string everywhere
// (Mode-C tap-to-call rendering, manager roster). Riders + customers will
// see whatever the manager types, so basic shape validation is enough.
function isE164ish(value: string): boolean {
  return /^\+\d{8,15}$/.test(value);
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Updates the manager-editable subset of `courier_fleets`:
 *   - name (display name shown to Mode-C riders + customer comms)
 *   - brand_color (header chip on the fleet dashboard + rider badge)
 *   - contact_phone (rider tap-to-call dispatcher; persisted per fleet)
 *
 * Slug, tier, allowed_verticals, ownership and is_active stay platform-admin-only
 * — those affect billing + cross-tenant routing, not day-to-day dispatch.
 */
export async function updateFleetSettingsAction(
  formData: FormData,
): Promise<FleetActionResult> {
  const ctx = await getFleetManagerContext();
  if (!ctx) return { ok: false, error: 'Acces interzis.' };

  const name = (formData.get('name') as string | null)?.trim() ?? '';
  const brandColor = (formData.get('brand_color') as string | null)?.trim() ?? '';
  const contactPhoneRaw = (formData.get('contact_phone') as string | null)?.trim() ?? '';

  if (!name) return { ok: false, error: 'Numele flotei este obligatoriu.' };
  if (brandColor && !HEX_COLOR.test(brandColor)) {
    return { ok: false, error: 'Culoarea trebuie în format #RRGGBB.' };
  }
  if (contactPhoneRaw && !isE164ish(contactPhoneRaw)) {
    return { ok: false, error: 'Telefonul trebuie în format E.164 (+40…).' };
  }

  const updates: Record<string, unknown> = { name };
  if (brandColor) updates.brand_color = brandColor;
  // Store empty string as NULL so Mode-C riders cleanly fall back to the
  // generic dispecer label instead of an "tel:" with empty href.
  updates.contact_phone = contactPhoneRaw === '' ? null : contactPhoneRaw;

  const admin = createAdminClient();
  const { error } = await (admin as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  })
    .from('courier_fleets')
    .update(updates)
    .eq('id', ctx.fleetId);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    actorUserId: ctx.userId,
    action: 'fleet.settings_updated',
    entityType: 'courier_fleet',
    entityId: ctx.fleetId,
    metadata: updates,
  });

  revalidatePath('/fleet');
  revalidatePath('/fleet/settings');
  return { ok: true };
}

/**
 * Manager-driven rider assignment. Sets `assigned_courier_user_id` on the
 * order and flips `status` to ACCEPTED if it was CREATED/OFFERED. The order
 * MUST belong to the manager's fleet — we filter by both `id` and `fleet_id`
 * in the same UPDATE so the row never crosses fleet boundaries.
 *
 * Mode-C riders never browse, so this is the only legitimate path for an
 * order to land on a Mode-C rider's queue.
 */
export async function assignOrderToCourierAction(
  orderId: string,
  courierUserId: string,
): Promise<FleetActionResult> {
  const ctx = await getFleetManagerContext();
  if (!ctx) return { ok: false, error: 'Acces interzis.' };

  const admin = createAdminClient();

  // Make sure the courier belongs to this fleet — defence-in-depth even
  // though the dispatcher UI only renders the fleet's own riders.
  const { data: courierRow } = await (admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: { user_id: string } | null }>;
          };
        };
      };
    };
  })
    .from('courier_profiles')
    .select('user_id')
    .eq('user_id', courierUserId)
    .eq('fleet_id', ctx.fleetId)
    .maybeSingle();

  if (!courierRow) return { ok: false, error: 'Curierul nu aparține flotei.' };

  // Update + filter by fleet_id so a manager can't reassign someone else's order.
  const { error } = await (admin as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
  })
    .from('courier_orders')
    .update({
      assigned_courier_user_id: courierUserId,
      status: 'ACCEPTED',
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('fleet_id', ctx.fleetId);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    actorUserId: ctx.userId,
    action: 'fleet.order_assigned',
    entityType: 'courier_order',
    entityId: orderId,
    metadata: { fleet_id: ctx.fleetId, courier_user_id: courierUserId },
  });

  revalidatePath('/fleet');
  revalidatePath('/fleet/orders');
  revalidatePath(`/fleet/orders/${orderId}`);
  return { ok: true };
}

/** Unassign — order falls back to OFFERED so another rider can pick it up. */
export async function unassignOrderAction(orderId: string): Promise<FleetActionResult> {
  const ctx = await getFleetManagerContext();
  if (!ctx) return { ok: false, error: 'Acces interzis.' };

  const admin = createAdminClient();
  const { error } = await (admin as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => {
            in: (c: string, v: string[]) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
    };
  })
    .from('courier_orders')
    .update({
      assigned_courier_user_id: null,
      status: 'OFFERED',
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('fleet_id', ctx.fleetId)
    // Only allow unassign while the order is still in pre-pickup. Once the
    // rider has the parcel in hand, mid-flight reassignment needs a heavier
    // workflow (rider hand-off + parcel transfer audit) we don't have yet.
    .in('status', ['ACCEPTED']);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    actorUserId: ctx.userId,
    action: 'fleet.order_unassigned',
    entityType: 'courier_order',
    entityId: orderId,
    metadata: { fleet_id: ctx.fleetId },
  });

  revalidatePath('/fleet');
  revalidatePath('/fleet/orders');
  revalidatePath(`/fleet/orders/${orderId}`);
  return { ok: true };
}
