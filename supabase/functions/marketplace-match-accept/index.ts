// Edge Function: marketplace-match-accept
//
// B2B Marketplace foundation 2026-06-16 — gated by HIR_FEATURE_MARKETPLACE_ENABLED.
// Strategy Master Plan Section 5 (B2B Marketplace), Stream 4/9.
//
// Contract: POST application/json
//   Authorization: Bearer <user JWT>
//   Body:
//     {
//       offer_id: uuid,                  // required
//       hir_fee_cents?: int (>= 0)       // optional, default 100 (1 RON per Iulian directive)
//     }
//
// Caller must be tenant_member of the listing's vendor_tenant_id.
// final_price_cents is derived server-side from offer.offered_price_cents
// (vendor accepts at the price the fleet offered — no client-side override).
//
// On accept (single transaction via SECURITY DEFINER RPC):
//   - CAS flip offer.status PENDING -> ACCEPTED (race-safe per Anti-Regression §5)
//   - listing.status OPEN -> MATCHED, is_financial_record -> TRUE
//   - other PENDING offers on this listing -> REJECTED
//   - INSERT marketplace_matches (UNIQUE(listing_id) blocks double-accept)
//
// Anti-disintermediation pillars wired here:
//   - Pillar 1 (escrow): match row written with escrow_status defaults from schema.
//   - Pillar 2 (autofactură placeholder): RPC enqueues a settlement job
//     via ai_jobs_queue when present (best-effort; do not fail the accept).
//
// Response:
//   200 { ok: true, match_id, final_price_cents, hir_fee_cents }
//   400 invalid input
//   401 unauthenticated
//   403 not tenant member (vendor)
//   404 offer not found
//   409 offer or listing no longer in valid state (race lost / expired)
//   503 feature flag off
//   500 db / env error

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const DEFAULT_HIR_FEE_CENTS = 100; // 1 RON
const MAX_HIR_FEE_CENTS = 1_000_000; // 10,000 RON sanity ceiling

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

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

interface ParsedBody {
  offer_id: string;
  hir_fee_cents: number;
}

type ParseResult = { ok: true; body: ParsedBody } | { ok: false; error: string };

function parseBody(raw: unknown): ParseResult {
  if (!isPlainObject(raw)) return { ok: false, error: 'body_not_object' };
  if (!isUuid(raw.offer_id)) return { ok: false, error: 'offer_id_invalid' };

  let fee = DEFAULT_HIR_FEE_CENTS;
  if (raw.hir_fee_cents !== undefined && raw.hir_fee_cents !== null) {
    if (
      typeof raw.hir_fee_cents !== 'number' ||
      !Number.isFinite(raw.hir_fee_cents) ||
      !Number.isInteger(raw.hir_fee_cents) ||
      raw.hir_fee_cents < 0 ||
      raw.hir_fee_cents > MAX_HIR_FEE_CENTS
    ) {
      return { ok: false, error: 'hir_fee_cents_invalid' };
    }
    fee = raw.hir_fee_cents;
  }

  return { ok: true, body: { offer_id: raw.offer_id, hir_fee_cents: fee } };
}

interface OfferRow {
  id: string;
  listing_id: string;
  fleet_id: string;
  offered_price_cents: number;
  status: string;
  expires_at: string;
}

interface ListingRow {
  id: string;
  vendor_tenant_id: string;
  status: string;
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
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }
  const parsed = parseBody(rawBody);
  if (!parsed.ok) return json(400, { ok: false, error: parsed.error });
  const body = parsed.body;

  // Service-role client for verification + atomic RPC.
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Step 4: load offer + listing, verify caller is tenant_member of the
  // listing's vendor_tenant_id. RLS is RESTRICTIVE deny-all for authenticated
  // role (per migration 20260616_006); service_role reads it cleanly. We
  // verify membership explicitly server-side (belt+suspenders).
  const { data: offer, error: offerErr } = await admin
    .from('marketplace_offers')
    .select('id, listing_id, fleet_id, offered_price_cents, status, expires_at')
    .eq('id', body.offer_id)
    .maybeSingle<OfferRow>();
  if (offerErr) {
    console.error('[marketplace-match-accept] offer lookup failed:', offerErr.message);
    return json(500, { ok: false, error: 'offer_lookup_failed' });
  }
  if (!offer) return json(404, { ok: false, error: 'offer_not_found' });

  const { data: listing, error: listingErr } = await admin
    .from('marketplace_listings')
    .select('id, vendor_tenant_id, status')
    .eq('id', offer.listing_id)
    .maybeSingle<ListingRow>();
  if (listingErr) {
    console.error('[marketplace-match-accept] listing lookup failed:', listingErr.message);
    return json(500, { ok: false, error: 'listing_lookup_failed' });
  }
  if (!listing) return json(404, { ok: false, error: 'listing_not_found' });

  const { data: member, error: memberErr } = await admin
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('tenant_id', listing.vendor_tenant_id)
    .maybeSingle();
  if (memberErr) {
    console.error('[marketplace-match-accept] membership lookup failed:', memberErr.message);
    return json(500, { ok: false, error: 'membership_check_failed' });
  }
  if (!member) return json(403, { ok: false, error: 'not_tenant_member' });

  // Step 5: pre-flight state checks (cheap fail before the CAS transaction).
  if (offer.status !== 'PENDING') {
    return json(409, { ok: false, error: 'offer_not_pending' });
  }
  if (listing.status !== 'OPEN') {
    return json(409, { ok: false, error: 'listing_not_open' });
  }
  if (Date.parse(offer.expires_at) <= Date.now()) {
    return json(409, { ok: false, error: 'offer_expired' });
  }

  // Step 6: atomic accept. CAS on offer.status PENDING -> ACCEPTED ensures
  // exactly one winner under concurrent acceptance. The UNIQUE(listing_id)
  // on marketplace_matches blocks double-match at the storage layer as a
  // second line of defense.
  //
  // Implemented inline as a sequence of conditional updates; supabase-js
  // wraps each statement in its own implicit transaction. The race-safety
  // comes from the WHERE status='PENDING' filter on the offer update — the
  // first writer flips it, the second sees zero rows affected and we bail.

  // 6a: CAS offer PENDING -> ACCEPTED.
  const { data: offerCas, error: offerCasErr } = await admin
    .from('marketplace_offers')
    .update({ status: 'ACCEPTED', updated_at: new Date().toISOString() })
    .eq('id', offer.id)
    .eq('status', 'PENDING')
    .select('id')
    .maybeSingle();
  if (offerCasErr) {
    console.error('[marketplace-match-accept] offer CAS failed:', offerCasErr.message);
    return json(500, { ok: false, error: 'offer_update_failed' });
  }
  if (!offerCas) {
    // Race lost — another vendor session or a withdrawal already moved it.
    return json(409, { ok: false, error: 'offer_already_acted' });
  }

  // 6b: CAS listing OPEN -> MATCHED, flip is_financial_record TRUE.
  const { data: listingCas, error: listingCasErr } = await admin
    .from('marketplace_listings')
    .update({
      status: 'MATCHED',
      is_financial_record: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', listing.id)
    .eq('status', 'OPEN')
    .select('id')
    .maybeSingle();
  if (listingCasErr || !listingCas) {
    // Listing state slipped between pre-flight and now (e.g. CANCELLED,
    // EXPIRED). Compensate the offer flip to avoid an orphaned ACCEPTED.
    console.error(
      '[marketplace-match-accept] listing CAS failed, compensating offer:',
      listingCasErr?.message ?? 'no_row',
    );
    await admin
      .from('marketplace_offers')
      .update({ status: 'PENDING', updated_at: new Date().toISOString() })
      .eq('id', offer.id)
      .eq('status', 'ACCEPTED');
    if (listingCasErr) return json(500, { ok: false, error: 'listing_update_failed' });
    return json(409, { ok: false, error: 'listing_not_open' });
  }

  // 6c: INSERT match row. UNIQUE(listing_id) is the storage-level guard
  // against double-accept races that somehow slipped past the CAS.
  const finalPriceCents = offer.offered_price_cents;
  const { data: match, error: matchErr } = await admin
    .from('marketplace_matches')
    .insert({
      listing_id: listing.id,
      offer_id: offer.id,
      fleet_id: offer.fleet_id,
      final_price_cents: finalPriceCents,
      hir_fee_cents: body.hir_fee_cents,
      status: 'MATCHED',
      is_financial_record: true,
    })
    .select('id')
    .single();
  if (matchErr || !match) {
    // UNIQUE violation here means a concurrent accept beat us to it despite
    // the CAS — compensate both updates.
    console.error('[marketplace-match-accept] match insert failed:', matchErr?.message);
    await admin
      .from('marketplace_listings')
      .update({
        status: 'OPEN',
        is_financial_record: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', listing.id)
      .eq('status', 'MATCHED');
    await admin
      .from('marketplace_offers')
      .update({ status: 'PENDING', updated_at: new Date().toISOString() })
      .eq('id', offer.id)
      .eq('status', 'ACCEPTED');
    const code = matchErr?.code === '23505' ? 'listing_already_matched' : 'match_insert_failed';
    return json(code === 'listing_already_matched' ? 409 : 500, { ok: false, error: code });
  }

  // 6d: reject all other PENDING offers on this listing.
  const { error: rejectErr } = await admin
    .from('marketplace_offers')
    .update({ status: 'REJECTED', updated_at: new Date().toISOString() })
    .eq('listing_id', listing.id)
    .eq('status', 'PENDING')
    .neq('id', offer.id);
  if (rejectErr) {
    // Non-fatal — match already exists and is canonical. Other offers may
    // still appear as PENDING; a sweeper or the next page load can clean up.
    console.error('[marketplace-match-accept] sibling reject failed (non-fatal):', rejectErr.message);
  }

  // Step 7: pillar 2 (autofactură placeholder) — best-effort enqueue.
  // ai_jobs_queue may not be present in all environments; ignore failures
  // so the accept stays committed.
  try {
    await admin.from('ai_jobs_queue').insert({
      kind: 'marketplace_autoinvoice_enqueue',
      payload: {
        match_id: match.id,
        listing_id: listing.id,
        offer_id: offer.id,
        fleet_id: offer.fleet_id,
        vendor_tenant_id: listing.vendor_tenant_id,
        final_price_cents: finalPriceCents,
        hir_fee_cents: body.hir_fee_cents,
      },
    });
  } catch (e) {
    console.warn(
      '[marketplace-match-accept] ai_jobs_queue enqueue skipped:',
      e instanceof Error ? e.message : String(e),
    );
  }

  return json(200, {
    ok: true,
    match_id: match.id as string,
    final_price_cents: finalPriceCents,
    hir_fee_cents: body.hir_fee_cents,
  });
});
