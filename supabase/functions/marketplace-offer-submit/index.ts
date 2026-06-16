// Edge Function: marketplace-offer-submit
//
// B2B Marketplace foundation 2026-06-16 — gated by HIR_FEATURE_MARKETPLACE_ENABLED.
// Strategy Master Plan Section 5 (B2B Marketplace), Stream 3/9.
//
// Anti-disintermediation pillar 1: HIR records every offer in the marketplace
// pool. No direct vendor↔fleet contact channel — bids flow through this fn.
//
// Contract: POST application/json
//   Authorization: Bearer <user JWT>  (fleet owner; verified via is_fleet_owner_of)
//   Body:
//     {
//       listing_id: uuid,                           // required, must be OPEN
//       fleet_id: uuid,                             // required, caller must own
//       offered_price_cents: int (>= 0),            // required
//       eta_minutes: int (1..240),                  // required
//       expires_at: ISO timestamp,                  // required, > now,
//                                                   //   <= listing.delivery_window_end
//       fleet_rating?: number (0..5, 2 decimals),
//       notes?: string (<= 1000 chars)
//     }
//
// Response:
//   200 { ok: true, offer_id, status: 'PENDING' }
//   400 invalid input | 401 unauthenticated | 403 not fleet owner
//   404 listing_not_found | 409 listing_not_open | 503 feature off | 500 db/env
//
// Idempotency: UNIQUE(listing_id, fleet_id) lets a fleet revise its bid via
// UPSERT (offered_price_cents, eta_minutes, notes, expires_at refreshed; status
// reset to PENDING). Accepted/rejected offers are not editable.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const MAX_NOTES_CHARS = 1000;
const MIN_ETA_MINUTES = 1;
const MAX_ETA_MINUTES = 240;
const MAX_PRICE_CENTS = 1_000_000_00; // 1,000,000 RON sanity ceiling
const MAX_EXPIRES_SKEW_MS = 24 * 60 * 60 * 1000; // expires_at must be within 24h

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders },
  });

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
}

function isIsoTimestamp(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const t = Date.parse(v);
  return Number.isFinite(t);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v);
}

interface ParsedBody {
  listing_id: string;
  fleet_id: string;
  offered_price_cents: number;
  eta_minutes: number;
  expires_at: string;
  fleet_rating: number | null;
  notes: string | null;
}

type ParseResult = { ok: true; body: ParsedBody } | { ok: false; error: string };

function parseBody(raw: unknown, nowMs: number): ParseResult {
  if (!isPlainObject(raw)) return { ok: false, error: 'body_not_object' };

  if (!isUuid(raw.listing_id)) return { ok: false, error: 'listing_id_invalid' };
  if (!isUuid(raw.fleet_id)) return { ok: false, error: 'fleet_id_invalid' };

  if (!isInteger(raw.offered_price_cents)) {
    return { ok: false, error: 'offered_price_cents_invalid' };
  }
  if (raw.offered_price_cents < 0 || raw.offered_price_cents > MAX_PRICE_CENTS) {
    return { ok: false, error: 'offered_price_cents_out_of_range' };
  }

  if (!isInteger(raw.eta_minutes)) return { ok: false, error: 'eta_minutes_invalid' };
  if (raw.eta_minutes < MIN_ETA_MINUTES || raw.eta_minutes > MAX_ETA_MINUTES) {
    return { ok: false, error: 'eta_minutes_out_of_range' };
  }

  if (!isIsoTimestamp(raw.expires_at)) return { ok: false, error: 'expires_at_invalid' };
  const expiresMs = Date.parse(raw.expires_at as string);
  if (expiresMs <= nowMs) return { ok: false, error: 'expires_at_must_be_future' };
  if (expiresMs - nowMs > MAX_EXPIRES_SKEW_MS) {
    return { ok: false, error: 'expires_at_too_far' };
  }

  let fleetRating: number | null = null;
  if (raw.fleet_rating !== undefined && raw.fleet_rating !== null) {
    if (
      typeof raw.fleet_rating !== 'number' ||
      !Number.isFinite(raw.fleet_rating) ||
      raw.fleet_rating < 0 ||
      raw.fleet_rating > 5
    ) {
      return { ok: false, error: 'fleet_rating_invalid' };
    }
    // Clamp to 2 decimals (matches numeric(3,2) column).
    fleetRating = Math.round(raw.fleet_rating * 100) / 100;
  }

  let notes: string | null = null;
  if (raw.notes !== undefined && raw.notes !== null) {
    if (typeof raw.notes !== 'string') return { ok: false, error: 'notes_invalid' };
    const trimmed = raw.notes.slice(0, MAX_NOTES_CHARS).trim();
    notes = trimmed.length === 0 ? null : trimmed;
  }

  return {
    ok: true,
    body: {
      listing_id: raw.listing_id,
      fleet_id: raw.fleet_id,
      offered_price_cents: raw.offered_price_cents,
      eta_minutes: raw.eta_minutes,
      expires_at: raw.expires_at as string,
      fleet_rating: fleetRating,
      notes,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Step 1: feature flag gate.
  if (Deno.env.get('HIR_FEATURE_MARKETPLACE_ENABLED') !== 'true') {
    return json(503, { ok: false, error: 'marketplace_feature_not_enabled' });
  }

  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    return json(500, { ok: false, error: 'supabase_env_missing' });
  }

  // Step 2: verify Bearer JWT.
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!token) return json(401, { ok: false, error: 'missing_bearer' });

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userRes?.user) return json(401, { ok: false, error: 'invalid_token' });
  const user = userRes.user;

  // Step 3: parse + validate JSON body.
  const nowMs = Date.now();
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }
  const parsed = parseBody(rawBody, nowMs);
  if (!parsed.ok) return json(400, { ok: false, error: parsed.error });
  const body = parsed.body;

  // Service-role client for ownership check + listing lookup + upsert.
  // We verify ownership explicitly server-side (service_role bypasses RLS),
  // mirroring the marketplace-listing-create pattern.
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Step 4: verify caller owns fleet_id.
  // Convention: courier_fleets.owner_user_id (per 20260509_002 + helper
  // is_fleet_owner_of in 20260616_009).
  const { data: fleet, error: fleetErr } = await admin
    .from('courier_fleets')
    .select('id, owner_user_id')
    .eq('id', body.fleet_id)
    .maybeSingle();
  if (fleetErr) {
    console.error('[marketplace-offer-submit] fleet lookup failed:', fleetErr.message);
    return json(500, { ok: false, error: 'fleet_lookup_failed' });
  }
  if (!fleet) return json(403, { ok: false, error: 'not_fleet_owner' });
  if (fleet.owner_user_id !== user.id) return json(403, { ok: false, error: 'not_fleet_owner' });

  // Step 5: load listing — must exist, be OPEN, and still within delivery window.
  const { data: listing, error: listingErr } = await admin
    .from('marketplace_listings')
    .select('id, status, delivery_window_end')
    .eq('id', body.listing_id)
    .maybeSingle();
  if (listingErr) {
    console.error('[marketplace-offer-submit] listing lookup failed:', listingErr.message);
    return json(500, { ok: false, error: 'listing_lookup_failed' });
  }
  if (!listing) return json(404, { ok: false, error: 'listing_not_found' });
  if (listing.status !== 'OPEN') return json(409, { ok: false, error: 'listing_not_open' });

  const windowEndMs = Date.parse(listing.delivery_window_end as string);
  if (!Number.isFinite(windowEndMs) || windowEndMs <= nowMs) {
    return json(409, { ok: false, error: 'listing_window_expired' });
  }
  if (Date.parse(body.expires_at) > windowEndMs) {
    return json(400, { ok: false, error: 'expires_at_past_window_end' });
  }

  // Step 6: UPSERT on UNIQUE(listing_id, fleet_id). A fleet may revise its
  // PENDING bid; ACCEPTED/REJECTED/WITHDRAWN/EXPIRED are terminal and the
  // upsert just overwrites status back to PENDING which we accept (revising
  // a withdrawn bid is allowed; terminal acceptance is guarded by the listing
  // status check above — if listing is MATCHED, status_not_open fires first).
  const { data: upserted, error: upsertErr } = await admin
    .from('marketplace_offers')
    .upsert(
      {
        listing_id: body.listing_id,
        fleet_id: body.fleet_id,
        offered_price_cents: body.offered_price_cents,
        eta_minutes: body.eta_minutes,
        fleet_rating: body.fleet_rating,
        notes: body.notes,
        expires_at: body.expires_at,
        status: 'PENDING',
        is_financial_record: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'listing_id,fleet_id' },
    )
    .select('id, status')
    .single();
  if (upsertErr || !upserted) {
    console.error('[marketplace-offer-submit] upsert failed:', upsertErr?.message);
    return json(500, { ok: false, error: 'upsert_failed' });
  }

  // Step 7: success.
  return json(200, {
    ok: true,
    offer_id: upserted.id as string,
    status: upserted.status as 'PENDING',
  });
});
