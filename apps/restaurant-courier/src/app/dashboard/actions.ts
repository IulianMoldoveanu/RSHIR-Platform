'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWebhook, notifyPharmaCallback } from '@/lib/webhook';
import { logAudit } from '@/lib/audit';
import { withRunLog } from '@/lib/with-run-log';

const GEOFENCE_WARN_METERS = 200;

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

// Soft-mode geofence assertion: best-effort warning when the rider's
// last GPS fix is more than ~200m from the order dropoff. Logs an
// audit row and otherwise lets delivery proceed. A hard-block mode
// (rejecting `markDeliveredAction`) is intentionally NOT enabled
// until we have telemetry on false-positive rates from Mode A
// pilots — RO indoor GPS can drift 30–100m in dense buildings.
async function assertDeliveryGeofence(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  orderId: string,
): Promise<void> {
  try {
    const [orderRes, shiftRes] = await Promise.all([
      admin
        .from('courier_orders')
        .select('dropoff_lat, dropoff_lng')
        .eq('id', orderId)
        .maybeSingle(),
      // Don't filter by status=ONLINE — a courier may flip OFFLINE
      // between the last GPS push and tapping "Livrat", and we still
      // want geofence telemetry on the most recent fix on record.
      admin
        .from('courier_shifts')
        .select('last_lat, last_lng, last_seen_at')
        .eq('courier_user_id', userId)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const order = orderRes.data as { dropoff_lat: number | null; dropoff_lng: number | null } | null;
    const shift = shiftRes.data as
      | { last_lat: number | null; last_lng: number | null; last_seen_at: string | null }
      | null;

    if (
      !order ||
      !shift ||
      order.dropoff_lat == null ||
      order.dropoff_lng == null ||
      shift.last_lat == null ||
      shift.last_lng == null
    ) {
      return;
    }

    const distance = haversineMeters(
      shift.last_lat,
      shift.last_lng,
      order.dropoff_lat,
      order.dropoff_lng,
    );

    if (distance > GEOFENCE_WARN_METERS) {
      await logAudit({
        actorUserId: userId,
        action: 'delivery.geofence_warning',
        entityType: 'courier_order',
        entityId: orderId,
        metadata: {
          distance_m: Math.round(distance),
          threshold_m: GEOFENCE_WARN_METERS,
          dropoff: [order.dropoff_lat, order.dropoff_lng],
          rider: [shift.last_lat, shift.last_lng],
          rider_seen_at: shift.last_seen_at,
        },
      });
    }
  } catch {
    // Geofence is observability, never a hard dependency on delivery.
  }
}

async function notifySubscriber(
  orderId: string,
  status: string,
  actorUserId?: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('courier_orders')
    .select('source_order_id, updated_at, vertical')
    .eq('id', orderId)
    .maybeSingle();
  if (!data) return;
  const row = data as {
    source_order_id: string | null;
    updated_at: string;
    vertical: 'restaurant' | 'pharma' | null;
  };

  // Pharma orders fan out to the pharma callback URL stored on the order.
  // Restaurant orders fan out to the third-party API webhook subscriber.
  // Both helpers are best-effort and idempotent on the receiver side.
  if (row.vertical === 'pharma') {
    void notifyPharmaCallback(orderId, status, actorUserId);
    return;
  }
  void sendWebhook(orderId, {
    event: 'order.status_changed',
    orderId,
    externalOrderId: row.source_order_id ?? null,
    status,
    occurredAt: row.updated_at,
  });
}

export async function logoutAction() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}

async function requireUserId(): Promise<string> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return user.id;
}

export async function startShiftAction() {
  const userId = await requireUserId();
  return withRunLog(
    'courier.startShift',
    { courier_user_id: userId },
    async () => {
      const admin = createAdminClient();

      // SUSPENDED riders cannot start a shift. The fleet manager's
      // suspendCourierAction sets profile.status='SUSPENDED' and ends the
      // current shift; without this guard a suspended rider could just tap
      // "Pornește tura" and reset themselves to ACTIVE, defeating the lockout.
      const { data: profileRow } = await admin
        .from('courier_profiles')
        .select('status')
        .eq('user_id', userId)
        .maybeSingle();
      if (profileRow && (profileRow as { status: string }).status === 'SUSPENDED') {
        // Silent no-op — surfacing an error toast here would require client
        // changes for every caller. The dashboard already renders a
        // "Suspendat" badge from the same column, which is the visible signal.
        return;
      }

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
    },
  );
}

export async function endShiftAction() {
  const userId = await requireUserId();
  return withRunLog(
    'courier.endShift',
    { courier_user_id: userId },
    async () => {
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
    },
  );
}

// Audit §3.4 — escape hatch when a courier has stale active orders they will
// never deliver (vendor cancelled out-of-band, customer disappeared, etc).
// Without this, the home-tab end-shift swipe is hidden while orders are
// active and the rider is trapped online indefinitely.
//
// Behaviour: cancel every order assigned to this courier that hasn't yet
// reached DELIVERED, log an audit row per cancellation with reason,
// notify subscribers, then end the shift. Mirrors the SQL guards from
// markPickedUp/markDelivered so we never roll back a DELIVERED order.
export async function forceEndShiftAction(
  reason: string,
): Promise<{ ok: true; cancelled: number } | { ok: false; error: string }> {
  const userId = await requireUserId();

  const trimmed = (reason ?? '').trim();
  if (trimmed.length < 3 || trimmed.length > 500) {
    // Pre-validation rejection — not wrapped in withRunLog so we don't
    // emit a function_runs row for keyboard-mash submissions.
    return { ok: false, error: 'Reason must be 3–500 characters.' };
  }

  return withRunLog(
    'courier.forceEndShift',
    // reason_length (not reason itself) — the full reason is in audit_log
    // per cancelled order, and we'd rather not duplicate user-typed text
    // in function_runs metadata which is admin-readable in a different
    // surface.
    { courier_user_id: userId, reason_length: trimmed.length },
    async () => {
      const admin = createAdminClient();

      // Identify and cancel each non-terminal active order for this courier.
      // We pull the list first so we can audit + notify per-row; one bulk
      // UPDATE would lose per-order context.
      const { data: activeOrders } = await admin
        .from('courier_orders')
        .select('id, status')
        .eq('assigned_courier_user_id', userId)
        .in('status', ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'])
        .select('id, status');

      const rows = (activeOrders ?? []) as Array<{ id: string; status: string }>;
      let cancelled = 0;
      for (const row of rows) {
        const { data: updated } = await admin
          .from('courier_orders')
          .update({
            status: 'CANCELLED',
            updated_at: new Date().toISOString(),
            cancellation_reason: `courier_force_end_shift: ${trimmed}`.slice(0, 500),
          })
          .eq('id', row.id)
          .eq('assigned_courier_user_id', userId)
          .in('status', ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'])
          .select('id')
          .maybeSingle();
        if (updated) {
          cancelled += 1;
          await logAudit({
            actorUserId: userId,
            action: 'order.force_cancelled_by_courier',
            entityType: 'courier_order',
            entityId: row.id,
            metadata: { previous_status: row.status, reason: trimmed },
          });
          await notifySubscriber(row.id, 'CANCELLED', userId);
        }
      }

      // End the shift (same path as endShiftAction).
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
      revalidatePath('/dashboard/orders');
      return { ok: true as const, cancelled };
    },
  );
}

export async function markPickedUpAction(orderId: string) {
  const userId = await requireUserId();
  return withRunLog(
    'courier.markPickedUp',
    { courier_user_id: userId, order_id: orderId },
    async () => {
      const admin = createAdminClient();
      // State-machine guard (audit P0): without `.in('status',['ACCEPTED'])`,
      // a courier could revert a DELIVERED or CANCELLED order back to
      // PICKED_UP and re-fire the webhook to subscribers. The atomic UPDATE
      // filters the row out cleanly when the status doesn't match —
      // `maybeSingle()` returns null and the notify call is skipped.
      const { data } = await admin
        .from('courier_orders')
        .update({ status: 'PICKED_UP', updated_at: new Date().toISOString() })
        .eq('id', orderId)
        .eq('assigned_courier_user_id', userId)
        .in('status', ['ACCEPTED'])
        .select('id')
        .maybeSingle();
      if (data) await notifySubscriber(orderId, 'PICKED_UP', userId);
      revalidatePath(`/dashboard/orders/${orderId}`);
      revalidatePath('/dashboard/orders');
    },
  );
}

// Validates the proof URL points at our own courier-proofs storage bucket.
// Without this, a malicious client could pass any URL into delivered_proof_url
// — that string is later rendered in admin / customer-tracking UIs and
// emitted in webhook payloads as the canonical "proof" value, so untrusted
// URLs become an XSS / phishing vector in trusted surfaces.
function isAllowedProofUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    if (!supaUrl) return false;
    const expectedHost = new URL(supaUrl).host;
    if (u.host !== expectedHost) return false;
    return u.pathname.includes('/storage/v1/object/public/courier-proofs/');
  } catch {
    return false;
  }
}

export async function markDeliveredAction(
  orderId: string,
  proofUrl?: string,
  cashCollected?: boolean,
  pharmaProofs?: { idUrl?: string; prescriptionUrl?: string },
) {
  const userId = await requireUserId();
  return withRunLog(
    'courier.markDelivered',
    {
      courier_user_id: userId,
      order_id: orderId,
      has_proof: !!proofUrl,
      cash_collected: cashCollected ?? false,
      has_pharma_proofs: !!(pharmaProofs?.idUrl || pharmaProofs?.prescriptionUrl),
    },
    async () => {
      const admin = createAdminClient();

      // Server-side enforcement of pharma proof requirement (Legea 95/2006).
      // PR #456 added a client-side guard in PhotoProofUpload, but the server
      // action and the drain route forwarded any payload through, so a
      // session-holding caller could still POST `markDeliveredAction(orderId)`
      // with no proofs and a pharma order would be marked DELIVERED with
      // delivered_proof_*_url = NULL. Closing the gap here applies to both
      // the UI path and the SW background-sync drain path.
      const { data: pharmaRow } = await admin
        .from('courier_orders')
        .select('vertical, pharma_metadata')
        .eq('id', orderId)
        .eq('assigned_courier_user_id', userId)
        .maybeSingle();
      if (pharmaRow && (pharmaRow as { vertical?: string | null }).vertical === 'pharma') {
        const meta = ((pharmaRow as { pharma_metadata?: unknown }).pharma_metadata ?? {}) as {
          requires_id_verification?: boolean;
          requires_prescription?: boolean;
        };
        const idOk =
          !meta.requires_id_verification ||
          (!!pharmaProofs?.idUrl && isAllowedProofUrl(pharmaProofs.idUrl));
        const rxOk =
          !meta.requires_prescription ||
          (!!pharmaProofs?.prescriptionUrl && isAllowedProofUrl(pharmaProofs.prescriptionUrl));
        if (!idOk || !rxOk) {
          const missing = [!idOk && 'id', !rxOk && 'prescription'].filter(Boolean).join('+');
          throw new Error(`pharma_proof_missing:${missing}`);
        }
      }

      const update: Record<string, unknown> = {
        status: 'DELIVERED',
        updated_at: new Date().toISOString(),
      };
      if (proofUrl && isAllowedProofUrl(proofUrl)) {
        update.delivered_proof_url = proofUrl;
        update.delivered_proof_taken_at = new Date().toISOString();
      }
      // Pharma orders: persist id + prescription proofs (migration 010) when
      // present and host-allowlisted. Previously these uploads landed in
      // storage but the URLs were lost, so post-delivery dispute resolution
      // had no record. Now they're forward-only on the order row.
      if (pharmaProofs?.idUrl && isAllowedProofUrl(pharmaProofs.idUrl)) {
        update.delivered_proof_id_url = pharmaProofs.idUrl;
      }
      if (pharmaProofs?.prescriptionUrl && isAllowedProofUrl(pharmaProofs.prescriptionUrl)) {
        update.delivered_proof_prescription_url = pharmaProofs.prescriptionUrl;
      }
      // State-machine guard (audit P0): only orders currently in PICKED_UP or
      // IN_TRANSIT may transition to DELIVERED. Without this, a courier with an
      // ACCEPTED order could swipe to deliver and skip the pickup leg entirely.
      const { data } = await admin
        .from('courier_orders')
        .update(update)
        .eq('id', orderId)
        .eq('assigned_courier_user_id', userId)
        .in('status', ['PICKED_UP', 'IN_TRANSIT'])
        .select('id, payment_method, total_ron')
        .maybeSingle();
      if (data) {
        // For cash-on-delivery orders, log the courier-confirmed cash
        // collection as an audit event. Settlement reconciliation reads this
        // trail to verify expected cash deposits per courier per shift.
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
        await assertDeliveryGeofence(admin, userId, orderId);
        await notifySubscriber(orderId, 'DELIVERED', userId);
      }
      revalidatePath(`/dashboard/orders/${orderId}`);
      revalidatePath('/dashboard/orders');
    },
  );
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
  // Reject Null Island. (0,0) passes the finite + bounds checks but is
  // virtually always a fallback artefact from a failed GPS fix — writing it
  // into the shift would corrupt the geofence audit's last_lat/last_lng.
  if (lat === 0 && lng === 0) return;

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

// Allowed vehicle types for the rider. Mirrors the CHECK constraint in
// courier_profiles. Adding a new vehicle requires a migration; keep this
// list in sync.
const VEHICLE_TYPES = ['BIKE', 'SCOOTER', 'CAR'] as const;
type VehicleType = (typeof VEHICLE_TYPES)[number];

function isVehicleType(value: unknown): value is VehicleType {
  return typeof value === 'string' && (VEHICLE_TYPES as readonly string[]).includes(value);
}

export async function updateVehicleAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const raw = formData.get('vehicle_type');
  if (!isVehicleType(raw)) return;
  const admin = createAdminClient();
  await admin
    .from('courier_profiles')
    .update({ vehicle_type: raw })
    .eq('user_id', userId);
  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard');
}

// Typed variant called from the client-side <VehicleSelector/> so it can
// commit on tap (instant visual feedback) without going through a form.
// The map's marker re-resolves on the next dashboard render — we revalidate
// /dashboard so the courier sees the new icon as soon as they navigate home.
export async function updateVehicleTypeAction(type: string): Promise<void> {
  const userId = await requireUserId();
  if (!isVehicleType(type)) return;
  const admin = createAdminClient();
  await admin
    .from('courier_profiles')
    .update({ vehicle_type: type })
    .eq('user_id', userId);
  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard');
}

// Validates the URL points at the courier-avatars bucket on our Supabase
// project. Storage RLS pins INSERT/UPDATE to the courier's own folder by uid,
// so the only way an attacker reaches this action with a forged URL is if
// they bypass auth — but we still reject anything that isn't our own bucket
// so the column never holds an arbitrary external URL the platform later
// trusts (mirrors the partner.hero_image_url host-allowlist pattern).
function isAllowedAvatarUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    if (!supaUrl) return false;
    const expectedHost = new URL(supaUrl).host;
    if (u.host !== expectedHost) return false;
    return u.pathname.includes('/storage/v1/object/public/courier-avatars/');
  } catch {
    return false;
  }
}

export async function updateAvatarUrlAction(url: string | null): Promise<void> {
  const userId = await requireUserId();
  if (url !== null && !isAllowedAvatarUrl(url)) return;
  const admin = createAdminClient();
  await admin
    .from('courier_profiles')
    .update({ avatar_url: url })
    .eq('user_id', userId);
  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard');
}

export async function acceptOrderAction(orderId: string) {
  const userId = await requireUserId();
  return withRunLog(
    'courier.acceptOrder',
    { courier_user_id: userId, order_id: orderId },
    async () => {
      const admin = createAdminClient();

      // Defense-in-depth fleet match: SELECT-side RLS already filters orders to
      // the courier's own fleet on the read path, but `admin` is service-role
      // and bypasses RLS. Without an explicit fleet check here, a courier who
      // somehow learns an orderId in a different fleet (UUIDv4 makes this
      // infeasible to brute-force, but defense-in-depth is cheap) could
      // hijack the assignment. Resolve the courier's fleet first and gate
      // the UPDATE on `fleet_id` matching.
      const { data: profile } = await admin
        .from('courier_profiles')
        .select('fleet_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (!profile) return; // not a courier — silent no-op preserves prior contract
      const fleetId = (profile as { fleet_id: string }).fleet_id;

      // Only accept if currently CREATED or OFFERED, unassigned, AND the order
      // belongs to the courier's fleet.
      const { data } = await admin
        .from('courier_orders')
        .update({
          status: 'ACCEPTED',
          assigned_courier_user_id: userId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId)
        .eq('fleet_id', fleetId)
        .in('status', ['CREATED', 'OFFERED'])
        .is('assigned_courier_user_id', null)
        .select('id')
        .maybeSingle();
      if (data) await notifySubscriber(orderId, 'ACCEPTED', userId);
      revalidatePath(`/dashboard/orders/${orderId}`);
      revalidatePath('/dashboard/orders');
    },
  );
}
