// courier-mirror-pharma — Phase B of courier app unification.
//
// Receives signed webhook events from the pharma NestJS backend and mirrors
// each pharma order as a row in `courier_orders` (vertical='pharma') so the
// unified courier app can dispatch it alongside restaurant orders.
//
// Contract doc: docs/strategy/2026-04-29-courier-unification-direction.md
//
// Auth: HMAC-SHA256 over the raw request body.
//   Header: X-HIR-Signature: sha256=<hex>
//   Secret: pulled from pharma_webhook_secrets where name='primary' and is_active=true.
//
// Auto-injected by Supabase runtime:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { timingSafeEqual } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CourierOrderStatus =
  | 'CREATED'
  | 'OFFERED'
  | 'ACCEPTED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED';

type PharmaEvent = 'order.created' | 'order.status_changed' | 'order.cancelled';

type WebhookBody = {
  event: PharmaEvent;
  at: string;
  order: {
    pharma_order_id: string;
    status: string;
    pickup: {
      lat: number;
      lng: number;
      address: string;
      contact_name: string;
      contact_phone: string;
    };
    dropoff: {
      lat: number;
      lng: number;
      address: string;
      customer_name: string;
      customer_phone: string;
    };
    items_summary: string;
    requires_id_verification: boolean;
    requires_prescription: boolean;
    total_value_ron: number;
  };
  fleet_slug?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

// Maps pharma order status strings to courier_orders status enum values.
// Pharma has many intermediate states; we map to the nearest courier
// equivalent. Unknown statuses default to CREATED so the row still lands.
function mapStatus(pharmaStatus: string): CourierOrderStatus {
  const s = pharmaStatus.toUpperCase();
  if (s === 'CANCELLED' || s === 'REJECTED') return 'CANCELLED';
  if (s === 'DELIVERED') return 'DELIVERED';
  if (s === 'IN_DELIVERY' || s === 'IN_TRANSIT') return 'IN_TRANSIT';
  if (s === 'PICKED_UP') return 'PICKED_UP';
  if (s === 'DISPATCHED' || s === 'ACCEPTED') return 'ACCEPTED';
  if (s === 'READY_FOR_PICKUP') return 'OFFERED';
  // RECEIVED / PROCESSING / PHARMACIST_REVIEW / etc → not yet dispatched
  return 'CREATED';
}

// Constant-time HMAC comparison (node:crypto timingSafeEqual wrapped for strings).
async function verifyHmac(rawBody: string, header: string, secret: string): Promise<boolean> {
  // header format: "sha256=<hex>"
  const prefix = 'sha256=';
  if (!header.startsWith(prefix)) return false;
  const receivedHex = header.slice(prefix.length);

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const expectedHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time compare via node:crypto if available, otherwise manual XOR.
  try {
    const a = encoder.encode(expectedHex);
    const b = encoder.encode(receivedHex);
    if (a.byteLength !== b.byteLength) return false;
    // @ts-ignore — node:crypto available in Deno 1.40+
    return timingSafeEqual(a, b);
  } catch {
    // Fallback: manual XOR (still length-checked above)
    if (expectedHex.length !== receivedHex.length) return false;
    let diff = 0;
    for (let i = 0; i < expectedHex.length; i++) {
      diff |= expectedHex.charCodeAt(i) ^ receivedHex.charCodeAt(i);
    }
    return diff === 0;
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('[courier-mirror-pharma] missing supabase env');
    return json(500, { error: 'server_misconfigured' });
  }

  // Read the raw body FIRST — before any JSON.parse — for HMAC verification.
  const rawBody = await req.text();

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Load the active HMAC secret.
  const { data: secretRow, error: secretErr } = await supabase
    .from('pharma_webhook_secrets')
    .select('secret')
    .eq('name', 'primary')
    .eq('is_active', true)
    .maybeSingle();

  if (secretErr || !secretRow) {
    console.error('[courier-mirror-pharma] secret lookup failed', secretErr?.message);
    return json(500, { error: 'secret_not_configured' });
  }

  // Verify HMAC BEFORE parsing the body.
  const sigHeader = req.headers.get('x-hir-signature') ?? '';
  const valid = await verifyHmac(rawBody, sigHeader, secretRow.secret);
  if (!valid) {
    console.warn('[courier-mirror-pharma] invalid HMAC');
    return json(401, { error: 'invalid_signature' });
  }

  // Parse body after signature check.
  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody) as WebhookBody;
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const { event, at, order, fleet_slug } = body;

  if (!event || !order?.pharma_order_id) {
    return json(400, { error: 'missing_required_fields' });
  }

  // Resolve fleet_id from slug (defaults to 'hir-default').
  const slug = fleet_slug ?? 'hir-default';
  const { data: fleetRow, error: fleetErr } = await supabase
    .from('courier_fleets')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (fleetErr || !fleetRow) {
    console.error('[courier-mirror-pharma] fleet not found', slug, fleetErr?.message);
    return json(400, { error: 'fleet_not_found', fleet_slug: slug });
  }

  const fleetId = fleetRow.id as string;
  const mappedStatus = mapStatus(order.status);

  // -------------------------------------------------------------------------
  // Event dispatch
  // -------------------------------------------------------------------------

  if (event === 'order.created') {
    // Idempotency: if a row with this external_ref already exists, return 200.
    const { data: existing } = await supabase
      .from('courier_orders')
      .select('id')
      .eq('external_ref', order.pharma_order_id)
      .eq('vertical', 'pharma')
      .maybeSingle();

    if (existing) {
      return json(200, { ok: true, courier_order_id: existing.id, idempotent: true });
    }

    const pharmaMetadata = {
      requires_id_verification: order.requires_id_verification,
      requires_prescription: order.requires_prescription,
      total_value_ron: order.total_value_ron,
      items_summary: order.items_summary,
    };

    const { data: inserted, error: insertErr } = await supabase
      .from('courier_orders')
      .insert({
        fleet_id: fleetId,
        vertical: 'pharma',
        external_ref: order.pharma_order_id,
        source_type: 'EXTERNAL_API',
        status: mappedStatus,
        // Pickup
        pickup_line1: order.pickup.address,
        pickup_lat: order.pickup.lat,
        pickup_lng: order.pickup.lng,
        // Dropoff
        dropoff_line1: order.dropoff.address,
        dropoff_lat: order.dropoff.lat,
        dropoff_lng: order.dropoff.lng,
        // Customer
        customer_first_name: order.dropoff.customer_name,
        customer_phone: order.dropoff.customer_phone,
        // Pharma-specific
        pharma_metadata: pharmaMetadata,
        // Required by schema
        public_track_token: crypto.randomUUID(),
        items: [],
        created_at: at,
        updated_at: at,
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('[courier-mirror-pharma] insert failed', insertErr.message);
      return json(500, { error: 'insert_failed', detail: insertErr.message });
    }

    await auditLog(supabase, 'courier_mirror.order_created', order.pharma_order_id, inserted.id);

    // Fire-and-forget Web Push to all active couriers in the fleet. Same
    // hook the restaurant-courier external/orders route uses (#68). Pharma
    // orders need the ping too — without it, couriers would only see the
    // order via the realtime feed when they happen to look at the app.
    void firePushDispatch(fleetId, inserted.id, {
      title: 'HIR Courier — Comandă farmacie',
      body: 'Ai o nouă livrare farma disponibilă.',
    });

    return json(200, { ok: true, courier_order_id: inserted.id });
  }

  if (event === 'order.status_changed' || event === 'order.cancelled') {
    const targetStatus = event === 'order.cancelled' ? 'CANCELLED' : mappedStatus;

    // Find the existing mirror row.
    const { data: existing, error: findErr } = await supabase
      .from('courier_orders')
      .select('id, updated_at')
      .eq('external_ref', order.pharma_order_id)
      .eq('vertical', 'pharma')
      .maybeSingle();

    if (findErr) {
      console.error('[courier-mirror-pharma] lookup failed', findErr.message);
      return json(500, { error: 'lookup_failed' });
    }

    if (!existing) {
      // Pharma may send status_changed before order.created if there's a
      // race at startup. Log and return 404 so the pharma side retries later.
      console.warn('[courier-mirror-pharma] mirror row not found for', order.pharma_order_id);
      return json(404, { error: 'mirror_not_found', pharma_order_id: order.pharma_order_id });
    }

    // HIR wins on conflict: only update if pharma's `at` is newer than the
    // current updated_at. Prevents old retries from overwriting fresher state.
    const existingUpdatedAt = new Date(existing.updated_at as string);
    const eventAt = new Date(at);
    if (eventAt <= existingUpdatedAt) {
      return json(200, { ok: true, courier_order_id: existing.id, skipped: 'stale_event' });
    }

    const { error: updateErr } = await supabase
      .from('courier_orders')
      .update({ status: targetStatus, updated_at: at })
      .eq('id', existing.id);

    if (updateErr) {
      console.error('[courier-mirror-pharma] update failed', updateErr.message);
      return json(500, { error: 'update_failed', detail: updateErr.message });
    }

    await auditLog(
      supabase,
      event === 'order.cancelled' ? 'courier_mirror.order_cancelled' : 'courier_mirror.status_changed',
      order.pharma_order_id,
      existing.id,
      { from: order.status, to: targetStatus },
    );
    return json(200, { ok: true, courier_order_id: existing.id });
  }

  return json(400, { error: 'unknown_event', event });
});

// ---------------------------------------------------------------------------
// Push helper — pings courier-push-dispatch for newly mirrored pharma
// orders. Fire-and-forget; failures are logged but never block the
// webhook response since the order has already been persisted.
// ---------------------------------------------------------------------------
async function firePushDispatch(
  fleetId: string,
  orderId: string,
  payload: { title?: string; body?: string } = {},
): Promise<void> {
  try {
    const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/courier-push-dispatch`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        fleet_id: fleetId,
        order_id: orderId,
        ...payload,
      }),
    });
    if (!res.ok) {
      console.error(
        '[courier-mirror-pharma] push dispatch non-2xx',
        res.status,
        await res.text().catch(() => ''),
      );
    }
  } catch (err) {
    console.error(
      '[courier-mirror-pharma] push dispatch fetch failed',
      (err as Error).message,
    );
  }
}

// ---------------------------------------------------------------------------
// Audit helper — logs to courier_mirror_audit (a lightweight local table,
// separate from the restaurant audit_log which requires a tenants FK).
// Non-fatal: failures are logged but never surface to the caller.
// ---------------------------------------------------------------------------
async function auditLog(
  supabase: ReturnType<typeof createClient>,
  action: string,
  pharmaOrderId: string,
  courierOrderId: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  // console.log is the simplest audit that works without a tenant FK.
  // A dedicated courier_mirror_audit table can be added in a follow-up
  // migration once the volume justifies it.
  console.log('[courier-mirror-pharma] audit', {
    action,
    pharma_order_id: pharmaOrderId,
    courier_order_id: courierOrderId,
    ...extra,
  });

  // Attempt insert into courier_mirror_audit if it exists (created by a future
  // migration). Swallow the error if the table is absent — the console log above
  // is the fallback.
  const { error } = await supabase.from('courier_mirror_audit').insert({
    action,
    pharma_order_id: pharmaOrderId,
    courier_order_id: courierOrderId,
    metadata: extra ?? null,
  });
  if (error && !error.message.includes('does not exist')) {
    console.error('[courier-mirror-pharma] audit insert failed', error.message);
  }
}
