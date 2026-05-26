/**
 * Edge Function: courier-combo-tick
 *
 * Wave 5.2 — proactive combo push notifications for HIR couriers.
 *
 * Runs every 2 minutes via pg_cron. For each ACTIVE courier with ≥1 in-flight
 * order (ACCEPTED/PICKED_UP/IN_TRANSIT), scans for unassigned/CREATED/OFFERED
 * orders inside a 1.2 km radius of any active pickup/dropoff point. If a
 * candidate exists AND the courier has NOT been pushed a combo in the past
 * 15 minutes, send a VAPID push and write a courier_combo_pushes audit row.
 *
 * The push payload includes order_id (deep-link target) + cluster summary
 * ("o comandă la 850 m de tine"). Tap → /dashboard/orders/[id].
 *
 * No new env vars: reuses VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT
 * already configured for courier-push-dispatch.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error — npm:web-push has no Deno types but works at runtime
import webpush from 'npm:web-push@3.6.7';
import { withRunLog } from '../_shared/log.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const COMBO_RADIUS_KM = 1.2;
const DEDUPE_MIN = 15;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  return withRunLog('courier-combo-tick', async ({ setMetadata }) => {
    const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY');
    const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:courier@hiraisolutions.ro';
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return new Response(JSON.stringify({ error: 'vapid_not_configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Pull all in-flight orders (those that anchor an active route).
    const { data: activeOrders, error: activeErr } = await sb
      .from('courier_orders')
      .select('id, assigned_courier_user_id, status, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng')
      .in('status', ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'])
      .not('assigned_courier_user_id', 'is', null);

    if (activeErr) {
      console.error('[combo-tick] active query failed', activeErr);
      return new Response(JSON.stringify({ error: 'db_active' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!activeOrders || activeOrders.length === 0) {
      setMetadata({ active: 0 });
      return new Response(JSON.stringify({ ok: true, sent: 0, note: 'no_active' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Pull all unassigned candidate orders.
    const { data: candidates, error: candErr } = await sb
      .from('courier_orders')
      .select('id, status, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, source_tenant_id')
      .in('status', ['CREATED', 'OFFERED'])
      .is('assigned_courier_user_id', null);

    if (candErr) {
      console.error('[combo-tick] candidate query failed', candErr);
      return new Response(JSON.stringify({ error: 'db_candidates' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!candidates || candidates.length === 0) {
      setMetadata({ active: activeOrders.length, candidates: 0 });
      return new Response(JSON.stringify({ ok: true, sent: 0, note: 'no_candidates' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Group active orders by courier.
    const byCourier = new Map<string, typeof activeOrders>();
    for (const o of activeOrders) {
      const uid = o.assigned_courier_user_id as string;
      const arr = byCourier.get(uid) ?? [];
      arr.push(o);
      byCourier.set(uid, arr);
    }

    // 4. Dedupe lookup: who was pushed in the last DEDUPE_MIN minutes?
    const userIds = [...byCourier.keys()];
    const sinceIso = new Date(Date.now() - DEDUPE_MIN * 60_000).toISOString();
    const { data: recentPushes } = await sb
      .from('courier_combo_pushes')
      .select('courier_user_id')
      .in('courier_user_id', userIds)
      .gte('sent_at', sinceIso);
    const deduped = new Set((recentPushes ?? []).map((r: { courier_user_id: string }) => r.courier_user_id));

    // 5. For each non-deduped courier, find the closest candidate to any of
    //    their active stops.
    const sends: Array<{
      courier_user_id: string;
      anchor_order_id: string;
      candidate_id: string;
      distance_km: number;
    }> = [];

    for (const [uid, orders] of byCourier.entries()) {
      if (deduped.has(uid)) continue;
      let best: { candId: string; anchorId: string; km: number } | null = null;
      for (const o of orders) {
        const isAfterPickup = o.status === 'PICKED_UP' || o.status === 'IN_TRANSIT';
        const anchor = isAfterPickup
          ? { lat: o.dropoff_lat as number, lng: o.dropoff_lng as number }
          : { lat: o.pickup_lat as number, lng: o.pickup_lng as number };
        if (anchor.lat == null || anchor.lng == null) continue;
        for (const c of candidates) {
          const cPickup = { lat: c.pickup_lat as number, lng: c.pickup_lng as number };
          if (cPickup.lat == null || cPickup.lng == null) continue;
          const km = haversineKm(anchor, cPickup);
          if (km <= COMBO_RADIUS_KM && (!best || km < best.km)) {
            best = { candId: c.id as string, anchorId: o.id as string, km };
          }
        }
      }
      if (best) {
        sends.push({
          courier_user_id: uid,
          anchor_order_id: best.anchorId,
          candidate_id: best.candId,
          distance_km: best.km,
        });
      }
    }

    if (sends.length === 0) {
      setMetadata({ active: activeOrders.length, candidates: candidates.length, sent: 0 });
      return new Response(JSON.stringify({ ok: true, sent: 0, note: 'no_combos' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 6. Pull subscriptions for the targeted couriers.
    const targetIds = sends.map((s) => s.courier_user_id);
    const { data: subs } = await sb
      .from('courier_push_subscriptions')
      .select('endpoint, p256dh, auth, user_id')
      .in('user_id', targetIds);

    const subsByUser = new Map<string, Array<{ endpoint: string; p256dh: string; auth: string }>>();
    for (const s of (subs ?? []) as Array<{ user_id: string; endpoint: string; p256dh: string; auth: string }>) {
      const arr = subsByUser.get(s.user_id) ?? [];
      arr.push({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth });
      subsByUser.set(s.user_id, arr);
    }

    let sent = 0;
    let pruned = 0;
    for (const item of sends) {
      const userSubs = subsByUser.get(item.courier_user_id) ?? [];
      if (userSubs.length === 0) continue;
      const distLabel =
        item.distance_km < 0.4
          ? 'la mai puțin de 400 m'
          : item.distance_km < 1
            ? `la ~${Math.round(item.distance_km * 1000)} m`
            : `la ~${item.distance_km.toFixed(1)} km`;
      const payload = JSON.stringify({
        title: 'Hepi Curier: combo profitabil',
        body: `Există o comandă ${distLabel} de tine. O preiei?`,
        orderId: item.candidate_id,
        url: `/dashboard/orders/${item.candidate_id}`,
      });

      // Write audit row first (idempotency: if the function crashes mid-send,
      // we won't spam the courier again within the dedupe window).
      await sb.from('courier_combo_pushes').insert({
        courier_user_id: item.courier_user_id,
        anchor_order_id: item.anchor_order_id,
        combo_order_ids: [item.candidate_id],
      });

      for (const s of userSubs) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 60 },
          );
          sent++;
        } catch (err) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const status = (err as any)?.statusCode;
          if (status === 410 || status === 404) {
            await sb.from('courier_push_subscriptions').delete().eq('endpoint', s.endpoint);
            pruned++;
          }
        }
      }
    }

    setMetadata({
      active: activeOrders.length,
      candidates: candidates.length,
      combos: sends.length,
      sent,
      pruned,
    });
    return new Response(
      JSON.stringify({ ok: true, combos: sends.length, sent, pruned }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  });
});
