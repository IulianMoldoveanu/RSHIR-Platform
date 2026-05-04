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

  // Update + gate on assignable pre-state. Without the status + assignment
  // filters, a stale tab could reassign an in-flight or already-DELIVERED
  // order back to ACCEPTED, breaking the state machine and the audit trail.
  // We also `.select()` and check the returned row so a zero-row update
  // surfaces as an explicit error instead of a silent success.
  const { data, error } = await (admin as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => {
            in: (c: string, v: string[]) => {
              is: (c: string, v: null) => {
                select: (cols: string) => {
                  maybeSingle: () => Promise<{
                    data: { id: string } | null;
                    error: { message: string } | null;
                  }>;
                };
              };
            };
          };
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
    .eq('fleet_id', ctx.fleetId)
    .in('status', ['CREATED', 'OFFERED'])
    .is('assigned_courier_user_id', null)
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return {
      ok: false,
      error: 'Comanda nu mai este disponibilă pentru asignare.',
    };
  }

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

/**
 * Suspend a courier in the manager's fleet. Sets `courier_profiles.status`
 * to SUSPENDED and ends any active shift so the rider stops counting
 * toward the "online" KPI. The rider can still log in but cannot start a
 * new shift while suspended.
 *
 * Filtered by both `user_id` and `fleet_id` so a manager can't suspend
 * riders that don't belong to their fleet.
 */
export async function suspendCourierAction(
  courierUserId: string,
): Promise<FleetActionResult> {
  const ctx = await getFleetManagerContext();
  if (!ctx) return { ok: false, error: 'Acces interzis.' };

  const admin = createAdminClient();
  // `.select().maybeSingle()` so a zero-row update (e.g. a stale or
  // tampered courierUserId not in this fleet) returns an explicit error
  // instead of silently logging a misleading audit entry.
  const { data, error } = await (admin as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => {
            select: (cols: string) => {
              maybeSingle: () => Promise<{
                data: { user_id: string } | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
  })
    .from('courier_profiles')
    .update({ status: 'SUSPENDED' })
    .eq('user_id', courierUserId)
    .eq('fleet_id', ctx.fleetId)
    .select('user_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Curierul nu aparține flotei.' };

  // End any open shift — failures here are swallowed (the suspension
  // itself is what matters for the audit trail; the shift end is just
  // hygiene so the manager doesn't see a phantom "online" rider).
  await (admin as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
  })
    .from('courier_shifts')
    .update({ status: 'OFFLINE', ended_at: new Date().toISOString() })
    .eq('courier_user_id', courierUserId)
    .eq('status', 'ONLINE');

  await logAudit({
    actorUserId: ctx.userId,
    action: 'fleet.courier_suspended',
    entityType: 'courier_profile',
    entityId: courierUserId,
    metadata: { fleet_id: ctx.fleetId },
  });

  revalidatePath('/fleet');
  revalidatePath('/fleet/couriers');
  return { ok: true };
}

/** Inverse of suspend — pushes status back to INACTIVE so the rider can go online again. */
export async function reactivateCourierAction(
  courierUserId: string,
): Promise<FleetActionResult> {
  const ctx = await getFleetManagerContext();
  if (!ctx) return { ok: false, error: 'Acces interzis.' };

  const admin = createAdminClient();
  // Same zero-row guard as the suspend path so a stale/tampered userId
  // outside this fleet doesn't write a misleading reactivation audit row.
  const { data, error } = await (admin as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => {
            select: (cols: string) => {
              maybeSingle: () => Promise<{
                data: { user_id: string } | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
  })
    .from('courier_profiles')
    .update({ status: 'INACTIVE' })
    .eq('user_id', courierUserId)
    .eq('fleet_id', ctx.fleetId)
    .select('user_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Curierul nu aparține flotei.' };

  await logAudit({
    actorUserId: ctx.userId,
    action: 'fleet.courier_reactivated',
    entityType: 'courier_profile',
    entityId: courierUserId,
    metadata: { fleet_id: ctx.fleetId },
  });

  revalidatePath('/fleet');
  revalidatePath('/fleet/couriers');
  return { ok: true };
}

/**
 * Heuristic auto-assignment: pick the "best" online rider in the fleet
 * for a given order and assign them. Selection priority:
 *   1. Online riders with zero in-progress orders, sorted by haversine
 *      distance from the order pickup (closest first).
 *   2. If everyone is busy, fall back to the rider with the fewest
 *      in-progress orders, ties broken by distance.
 *   3. Riders with no GPS fix are pushed to the end — we still pick them
 *      if nobody else is online, but they're a worse signal.
 *
 * The actual UPDATE goes through the same gate as `assignOrderToCourier
 * Action` — only orders in CREATED/OFFERED + unassigned get reassigned —
 * so a stale auto-assign click can't resurrect completed work.
 */
export async function autoAssignOrderAction(
  orderId: string,
): Promise<FleetActionResult & { courierUserId?: string; distanceM?: number }> {
  const ctx = await getFleetManagerContext();
  if (!ctx) return { ok: false, error: 'Acces interzis.' };

  const admin = createAdminClient();

  // Resolve the fleet's couriers + the order's pickup coords first, so
  // we can scope the shifts query by `courier_user_id IN (...)` instead
  // of a global `.limit(200)` that could starve fleets in noisy
  // platforms (Codex P1 #169).
  const [{ data: orderData }, { data: couriersData }] = await Promise.all([
    (
      admin as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            eq: (c: string, v: string) => {
              eq: (c: string, v: string) => {
                maybeSingle: () => Promise<{
                  data: {
                    id: string;
                    pickup_lat: number | null;
                    pickup_lng: number | null;
                    status: string;
                    assigned_courier_user_id: string | null;
                  } | null;
                }>;
              };
            };
          };
        };
      }
    )
      .from('courier_orders')
      .select('id, pickup_lat, pickup_lng, status, assigned_courier_user_id')
      .eq('id', orderId)
      .eq('fleet_id', ctx.fleetId)
      .maybeSingle(),
    (
      admin as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            eq: (
              c: string,
              v: string,
            ) => Promise<{
              data: Array<{ user_id: string; full_name: string | null; status: string }>;
            }>;
          };
        };
      }
    )
      .from('courier_profiles')
      .select('user_id, full_name, status')
      .eq('fleet_id', ctx.fleetId),
  ]);

  if (!orderData) return { ok: false, error: 'Comanda nu există în această flotă.' };
  const couriers = couriersData ?? [];
  const fleetIds = couriers.map((c) => c.user_id);

  // No riders in the fleet at all → exit before the second batch of
  // queries (which would otherwise short-circuit on empty .in() filters).
  if (fleetIds.length === 0) {
    return { ok: false, error: 'Niciun curier în flotă.' };
  }

  const [{ data: shiftsData }, { data: activeOrdersData }] = await Promise.all([
    (
      admin as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            in: (c: string, v: string[]) => {
              eq: (c: string, v: string) => {
                order: (col: string, opts: Record<string, unknown>) => Promise<{
                  data: Array<{
                    courier_user_id: string;
                    last_lat: number | null;
                    last_lng: number | null;
                    started_at: string;
                  }>;
                }>;
              };
            };
          };
        };
      }
    )
      .from('courier_shifts')
      .select('courier_user_id, last_lat, last_lng, started_at')
      .in('courier_user_id', fleetIds)
      .eq('status', 'ONLINE')
      .order('started_at', { ascending: false }),
    (
      admin as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            eq: (c: string, v: string) => {
              in: (c: string, v: string[]) => Promise<{
                data: Array<{ assigned_courier_user_id: string }>;
              }>;
            };
          };
        };
      }
    )
      .from('courier_orders')
      .select('assigned_courier_user_id')
      .eq('fleet_id', ctx.fleetId)
      .in('status', ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT']),
  ]);

  if (orderData.assigned_courier_user_id) {
    return { ok: false, error: 'Comanda este deja asignată.' };
  }
  if (!['CREATED', 'OFFERED'].includes(orderData.status)) {
    return { ok: false, error: 'Comanda nu mai poate fi asignată automat.' };
  }

  const shifts = shiftsData ?? [];
  const activeRows = activeOrdersData ?? [];

  // Active-orders count per rider (used for tie-breaking).
  const inProgress = new Map<string, number>();
  for (const r of activeRows) {
    inProgress.set(r.assigned_courier_user_id, (inProgress.get(r.assigned_courier_user_id) ?? 0) + 1);
  }

  // Latest shift row per online rider.
  const latestShift = new Map<string, { lat: number | null; lng: number | null }>();
  for (const s of shifts) {
    if (latestShift.has(s.courier_user_id)) continue;
    latestShift.set(s.courier_user_id, { lat: s.last_lat, lng: s.last_lng });
  }

  // Build candidate list: online riders that belong to this fleet and
  // are not SUSPENDED. (INACTIVE is fine — they just haven't started a
  // shift yet, but if they're in latestShift they've started one.)
  type Candidate = { userId: string; load: number; distanceM: number };
  const candidates: Candidate[] = [];
  const NO_GPS = Number.POSITIVE_INFINITY;
  for (const c of couriers) {
    if (c.status === 'SUSPENDED') continue;
    if (!latestShift.has(c.user_id)) continue;
    const fix = latestShift.get(c.user_id)!;
    const distance =
      orderData.pickup_lat != null &&
      orderData.pickup_lng != null &&
      fix.lat != null &&
      fix.lng != null
        ? haversineMeters(orderData.pickup_lat, orderData.pickup_lng, fix.lat, fix.lng)
        : NO_GPS;
    candidates.push({
      userId: c.user_id,
      load: inProgress.get(c.user_id) ?? 0,
      distanceM: distance,
    });
  }

  if (candidates.length === 0) {
    return { ok: false, error: 'Niciun curier online pentru asignare automată.' };
  }

  // Idle riders first; among same-load, closest wins. NO_GPS riders sort last.
  candidates.sort((a, b) => {
    if (a.load !== b.load) return a.load - b.load;
    return a.distanceM - b.distanceM;
  });
  const winner = candidates[0];

  // Same gated UPDATE as the manual assign path.
  const { data, error } = await (admin as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => {
            in: (c: string, v: string[]) => {
              is: (c: string, v: null) => {
                select: (cols: string) => {
                  maybeSingle: () => Promise<{
                    data: { id: string } | null;
                    error: { message: string } | null;
                  }>;
                };
              };
            };
          };
        };
      };
    };
  })
    .from('courier_orders')
    .update({
      assigned_courier_user_id: winner.userId,
      status: 'ACCEPTED',
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('fleet_id', ctx.fleetId)
    .in('status', ['CREATED', 'OFFERED'])
    .is('assigned_courier_user_id', null)
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return {
      ok: false,
      error: 'Comanda a fost asignată între timp de un alt dispecer.',
    };
  }

  await logAudit({
    actorUserId: ctx.userId,
    action: 'fleet.order_auto_assigned',
    entityType: 'courier_order',
    entityId: orderId,
    metadata: {
      fleet_id: ctx.fleetId,
      courier_user_id: winner.userId,
      distance_m: Number.isFinite(winner.distanceM) ? Math.round(winner.distanceM) : null,
      load: winner.load,
      candidates_considered: candidates.length,
    },
  });

  revalidatePath('/fleet');
  revalidatePath('/fleet/orders');
  revalidatePath(`/fleet/orders/${orderId}`);
  return {
    ok: true,
    courierUserId: winner.userId,
    distanceM: Number.isFinite(winner.distanceM) ? Math.round(winner.distanceM) : undefined,
  };
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Self-serve courier invite — fleet manager creates / invites a Supabase
 * auth user and bonds them to this fleet via `courier_profiles.fleet_id`.
 *
 * Behavior:
 *   - If a user with `email` already exists, just upsert/insert their
 *     courier_profiles row pointing at THIS fleet.
 *   - Otherwise inviteUserByEmail mints the user and sends the magic-link
 *     email; we still upsert the courier_profiles row so the fleet
 *     binding is in place when the rider first signs in.
 *
 * Filtered tightly: vehicle_type defaults to BIKE, status INACTIVE, and
 * the upsert is keyed by `user_id` to make re-inviting a rider safe.
 *
 * Mirrors the platform-admin `inviteCourier` in admin/fleets/actions.ts
 * but is gated on `getFleetManagerContext` instead of platform_admins,
 * and forces fleet_id to the manager's own fleet (a fleet manager can't
 * invite a rider into a competitor's fleet).
 */
export async function inviteCourierToFleetAction(
  formData: FormData,
): Promise<FleetActionResult & { userId?: string }> {
  const ctx = await getFleetManagerContext();
  if (!ctx) return { ok: false, error: 'Acces interzis.' };

  const email = (formData.get('email') as string | null)?.trim() ?? '';
  const fullName = (formData.get('full_name') as string | null)?.trim() ?? '';
  const phoneRaw = (formData.get('phone') as string | null)?.trim() ?? '';
  const vehicleType = (formData.get('vehicle_type') as string | null)?.trim() ?? 'BIKE';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Email invalid.' };
  }
  if (!fullName) {
    return { ok: false, error: 'Numele este obligatoriu.' };
  }
  if (!['BIKE', 'SCOOTER', 'CAR'].includes(vehicleType)) {
    return { ok: false, error: 'Tip vehicul invalid.' };
  }
  // Phone is optional but if present must be E.164-ish.
  if (phoneRaw && !/^\+\d{8,15}$/.test(phoneRaw)) {
    return { ok: false, error: 'Telefonul trebuie în format E.164 (+40…).' };
  }

  const admin = createAdminClient();

  // Resolve the user id: try inviteUserByEmail first (idempotent for new
  // users; existing users get an "already registered" path we handle by
  // paginating listUsers). Codex P1 #172: a single listUsers() call only
  // returns page 1, so projects with >1 page would silently fail to find
  // existing couriers. Walk the pages until we hit the user or empty.
  let userId: string | null = null;
  try {
    const sb = admin as unknown as {
      auth: {
        admin: {
          inviteUserByEmail: (
            email: string,
          ) => Promise<{
            data: { user: { id: string } | null } | null;
            error: { message: string } | null;
          }>;
          listUsers: (params?: { page?: number; perPage?: number }) => Promise<{
            data: { users: Array<{ id: string; email: string }> } | null;
          }>;
        };
      };
    };
    const { data: invited, error: inviteErr } = await sb.auth.admin.inviteUserByEmail(email);
    if (!inviteErr && invited?.user?.id) {
      userId = invited.user.id;
    } else {
      // Already registered → walk listUsers pages until we hit the user.
      // Hard cap at 50 pages × 200 = 10 000 users to bound the worst case
      // — well above any realistic fleet's reach but enough for projects
      // with shared auth pools.
      const PER_PAGE = 200;
      const MAX_PAGES = 50;
      for (let page = 1; page <= MAX_PAGES; page++) {
        const { data: pageResp } = await sb.auth.admin.listUsers({ page, perPage: PER_PAGE });
        const users = pageResp?.users ?? [];
        if (users.length === 0) break;
        const hit = users.find((u) => u.email === email);
        if (hit) {
          userId = hit.id;
          break;
        }
        if (users.length < PER_PAGE) break;
      }
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Invitare eșuată.',
    };
  }

  if (!userId) {
    return { ok: false, error: 'Nu am putut crea contul curier.' };
  }

  // Upsert the courier_profiles row keyed by user_id so re-inviting a
  // rider just rebinds them to this fleet without duplicating data.
  const profilePayload = {
    user_id: userId,
    fleet_id: ctx.fleetId,
    full_name: fullName,
    phone: phoneRaw || null,
    vehicle_type: vehicleType,
    status: 'INACTIVE',
  } as const;

  const { error: upsertErr } = await (
    admin as unknown as {
      from: (t: string) => {
        upsert: (
          row: Record<string, unknown>,
          opts: Record<string, unknown>,
        ) => Promise<{ error: { message: string } | null }>;
      };
    }
  )
    .from('courier_profiles')
    .upsert(profilePayload, { onConflict: 'user_id' });

  if (upsertErr) return { ok: false, error: upsertErr.message };

  await logAudit({
    actorUserId: ctx.userId,
    action: 'fleet.courier_self_invited',
    entityType: 'courier_profile',
    entityId: userId,
    metadata: {
      fleet_id: ctx.fleetId,
      email,
      vehicle_type: vehicleType,
    },
  });

  revalidatePath('/fleet');
  revalidatePath('/fleet/couriers');
  return { ok: true, userId };
}

/** Unassign — order falls back to OFFERED so another rider can pick it up. */
export async function unassignOrderAction(orderId: string): Promise<FleetActionResult> {
  const ctx = await getFleetManagerContext();
  if (!ctx) return { ok: false, error: 'Acces interzis.' };

  const admin = createAdminClient();
  // `.select().maybeSingle()` so a zero-row update (order moved past
  // ACCEPTED between render and click) returns an explicit error instead
  // of a silent success that would still write a misleading audit entry.
  const { data, error } = await (admin as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => {
            in: (c: string, v: string[]) => {
              select: (cols: string) => {
                maybeSingle: () => Promise<{
                  data: { id: string } | null;
                  error: { message: string } | null;
                }>;
              };
            };
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
    .in('status', ['ACCEPTED'])
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return {
      ok: false,
      error: 'Comanda nu mai poate fi reasignată — curierul a ridicat-o deja.',
    };
  }

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
