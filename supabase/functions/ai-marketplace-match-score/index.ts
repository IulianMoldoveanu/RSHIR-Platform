// Edge Function: ai-marketplace-match-score
//
// B2B Marketplace Stream 3 (AI matching engine) — real implementation.
// Replaces the 503 stub from the strategy scaffolding. Gated by
// HIR_FEATURE_AI_MATCHING_ENABLED. Strategy Master Plan Section 6 (AI
// Integration). Job type: marketplace_match_score.
//
// Purpose: score a fleet's OFFER against the vendor's LISTING on a 0..100
// composite scale, with an additive factor breakdown the UI uses to explain
// why one fleet ranks higher than another (price, ETA, rating, history).
//
// Model: claude-sonnet-4-6 (per board verdict — Sonnet 4.6 is the right
// price/quality tier for marketplace scoring; the rubric is structured
// enough that Opus is overkill). Sampling parameters (temperature/top_p) are
// removed on Sonnet 4.6 by API contract — steer via prompt only.
//
// Contract: POST application/json
//   Body: { listing_id: uuid, offer_id: uuid }
//
// Response:
//   200 { ok: true, score, factors: { price_score, eta_score, rating_score,
//        history_score }, reasoning, model_version, cached }
//   400 invalid body | 401 unauthenticated | 404 not_found | 503 feature off
//   500 anthropic_failure | db_failure | env_missing
//
// Idempotency: if marketplace_offers.ai_match_score is non-NULL and was
// written within IDEMPOTENCY_WINDOW_MS for this listing+offer pair, return
// the cached value without re-calling Anthropic. Same input → same output
// modulo model drift; the ai_jobs row remains the audit/replay surface.
//
// Cost target: $0.001-0.005 per call (claude-sonnet-4-6 at ~700 input +
// ~250 output tokens with adaptive thinking off).
//
// Auth: Bearer JWT (any authenticated user — service-role bypass for
// internal cron not yet wired). The edge fn performs no row-level scoping
// of its own beyond confirming the listing+offer exist; surface-level
// access (who can read the score) is enforced by marketplace_offers RLS
// from 20260616_009.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 600;
const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h — re-score after a day

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown): Response =>
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

// Haversine distance (km) between two lat/lng pairs. Returns null if either
// endpoint is missing/invalid.
function haversineKm(
  lat1: number | null,
  lng1: number | null,
  lat2: number | null,
  lng2: number | null,
): number | null {
  if (
    lat1 === null ||
    lng1 === null ||
    lat2 === null ||
    lng2 === null ||
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2)
  ) {
    return null;
  }
  const R = 6371; // km
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Extract lat/lng from a marketplace_listings address jsonb. Accepts the
// canonical keys (lat/lng) and the long-form synonyms (latitude/longitude)
// — listing-create whitelists both.
function extractLatLng(addr: Record<string, unknown> | null): {
  lat: number | null;
  lng: number | null;
} {
  if (!addr) return { lat: null, lng: null };
  const rawLat = addr.lat ?? addr.latitude;
  const rawLng = addr.lng ?? addr.longitude;
  const lat = typeof rawLat === 'number' && Number.isFinite(rawLat) ? rawLat : null;
  const lng = typeof rawLng === 'number' && Number.isFinite(rawLng) ? rawLng : null;
  return { lat, lng };
}

interface ParsedBody {
  listing_id: string;
  offer_id: string;
}

type ParseResult = { ok: true; body: ParsedBody } | { ok: false; error: string };

function parseBody(raw: unknown): ParseResult {
  if (!isPlainObject(raw)) return { ok: false, error: 'body_not_object' };
  if (!isUuid(raw.listing_id)) return { ok: false, error: 'listing_id_invalid' };
  if (!isUuid(raw.offer_id)) return { ok: false, error: 'offer_id_invalid' };
  return {
    ok: true,
    body: { listing_id: raw.listing_id, offer_id: raw.offer_id },
  };
}

interface ScoreFactors {
  price_score: number;
  eta_score: number;
  rating_score: number;
  history_score: number;
}

interface ScoreOutput {
  score: number;
  factors: ScoreFactors;
  reasoning: string;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function clamp100(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 100) return 100;
  return Math.round(v * 100) / 100;
}

// Parse the Anthropic response. Defensive — the model is instructed to emit
// strict JSON, but we accept either a bare JSON object or one wrapped in
// ```json ... ``` fences, and clamp out-of-range values rather than rejecting.
function parseScoreOutput(text: string): ScoreOutput | null {
  const stripped = text.trim();
  // Try to locate the first { and last } — tolerant to prose preamble.
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) return null;
  const jsonSlice = stripped.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;

  const scoreRaw = parsed.score;
  const factorsRaw = parsed.factors;
  const reasoningRaw = parsed.reasoning;

  if (typeof scoreRaw !== 'number') return null;
  if (!isPlainObject(factorsRaw)) return null;
  if (typeof reasoningRaw !== 'string') return null;

  const price = Number(factorsRaw.price_score);
  const eta = Number(factorsRaw.eta_score);
  const rating = Number(factorsRaw.rating_score);
  const history = Number(factorsRaw.history_score);

  return {
    score: clamp100(scoreRaw),
    factors: {
      price_score: clamp01(price),
      eta_score: clamp01(eta),
      rating_score: clamp01(rating),
      history_score: clamp01(history),
    },
    reasoning: reasoningRaw.slice(0, 600),
  };
}

interface AnthropicCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
): Promise<AnthropicCallResult> {
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`anthropic_${res.status}: ${errText.slice(0, 300)}`);
  }
  const data: unknown = await res.json();
  if (!isPlainObject(data)) throw new Error('anthropic_invalid_response');
  const content = (data as { content?: unknown }).content;
  let text = '';
  if (Array.isArray(content) && content.length > 0) {
    const first = content[0];
    if (isPlainObject(first) && first.type === 'text' && typeof first.text === 'string') {
      text = first.text;
    }
  }
  if (!text) throw new Error('anthropic_empty_response');
  const usage = isPlainObject((data as { usage?: unknown }).usage)
    ? ((data as { usage: Record<string, unknown> }).usage)
    : {};
  return {
    text,
    inputTokens: Number(usage.input_tokens ?? 0),
    outputTokens: Number(usage.output_tokens ?? 0),
  };
}

const SYSTEM_PROMPT = `You are a marketplace ranker for HIR's B2B delivery exchange. You receive a listing (a vendor's delivery job) and one fleet's offer, with a small context window of fleet reputation data and distance.

Score the offer 0..100, where higher means "this fleet is the better match for this listing", considering:
  - price_score: how competitive is offered_price_cents vs. typical for vertical+city (lower price = higher score, but absurdly low is suspicious — clamp).
  - eta_score: how well does eta_minutes fit the delivery window (sooner is better, but missing the window penalizes hard).
  - rating_score: fleet reputation (avg_customer_stars + dispute_count).
  - history_score: completed match count signal (more matches = more reliable).

Output STRICT JSON only — no prose preamble, no markdown fences. Shape:
{
  "score": <number 0..100>,
  "factors": {
    "price_score": <number 0..1>,
    "eta_score": <number 0..1>,
    "rating_score": <number 0..1>,
    "history_score": <number 0..1>
  },
  "reasoning": "<one or two sentences, max 600 chars, vendor-facing>"
}

Each factor is independently 0..1; the final score is your weighted composite (not a forced linear sum — you decide the weighting based on the listing's package_temperature/weight/urgency).`;

function buildUserMessage(ctx: {
  vertical: string;
  cityId: string | null;
  pickup: { lat: number | null; lng: number | null };
  dropoff: { lat: number | null; lng: number | null };
  distanceKm: number | null;
  packageDescription: string | null;
  packageTemperature: string | null;
  packageWeightGrams: number | null;
  deliveryWindowStart: string;
  deliveryWindowEnd: string;
  offeredPriceCents: number;
  etaMinutes: number;
  offerFleetRating: number | null;
  fleetAvgRating: number | null;
  fleetDisputeCount: number;
  fleetTotalMatches: number;
}): string {
  return [
    `LISTING:`,
    `  vertical: ${ctx.vertical}`,
    `  city_id: ${ctx.cityId ?? '(unknown)'}`,
    `  package: ${ctx.packageDescription ?? '(unspecified)'}`,
    `  temperature: ${ctx.packageTemperature ?? 'ambient'}`,
    `  weight_grams: ${ctx.packageWeightGrams ?? '(unspecified)'}`,
    `  delivery_window_start: ${ctx.deliveryWindowStart}`,
    `  delivery_window_end: ${ctx.deliveryWindowEnd}`,
    `  pickup_latlng: ${ctx.pickup.lat ?? '?'},${ctx.pickup.lng ?? '?'}`,
    `  dropoff_latlng: ${ctx.dropoff.lat ?? '?'},${ctx.dropoff.lng ?? '?'}`,
    `  haversine_km: ${ctx.distanceKm !== null ? ctx.distanceKm.toFixed(2) : 'unknown'}`,
    ``,
    `OFFER:`,
    `  offered_price_cents: ${ctx.offeredPriceCents}`,
    `  eta_minutes: ${ctx.etaMinutes}`,
    `  fleet_self_reported_rating: ${ctx.offerFleetRating ?? '(not provided)'}`,
    ``,
    `FLEET CONTEXT (last 30d aggregate):`,
    `  avg_customer_stars: ${ctx.fleetAvgRating ?? '(no history)'}`,
    `  dispute_count: ${ctx.fleetDisputeCount}`,
    `  total_matches: ${ctx.fleetTotalMatches}`,
    ``,
    `Score this offer. Respond with STRICT JSON only.`,
  ].join('\n');
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Step 1: feature flag.
  if (Deno.env.get('HIR_FEATURE_AI_MATCHING_ENABLED') !== 'true') {
    return json(503, { ok: false, error: 'ai_feature_not_enabled' });
  }

  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'method_not_allowed' });
  }

  // Step 2: env.
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    return json(500, { ok: false, error: 'supabase_env_missing' });
  }
  if (!ANTHROPIC_KEY) {
    return json(500, { ok: false, error: 'anthropic_key_missing' });
  }

  // Step 3: auth (Bearer JWT).
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
  if (userErr || !userRes?.user) {
    return json(401, { ok: false, error: 'invalid_token' });
  }
  const user = userRes.user;

  // Step 4: parse body.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }
  const parsed = parseBody(raw);
  if (!parsed.ok) return json(400, { ok: false, error: parsed.error });
  const body = parsed.body;

  // Step 5: service-role client (RLS-bypass for data assembly + writes).
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Step 6: load offer + cached score.
  const { data: offer, error: offerErr } = await admin
    .from('marketplace_offers')
    .select(
      'id, listing_id, fleet_id, offered_price_cents, eta_minutes, fleet_rating, status, ai_match_score, ai_match_score_at',
    )
    .eq('id', body.offer_id)
    .maybeSingle();
  if (offerErr) {
    console.error('[ai-marketplace-match-score] offer lookup failed:', offerErr.message);
    return json(500, { ok: false, error: 'offer_lookup_failed' });
  }
  if (!offer) return json(404, { ok: false, error: 'offer_not_found' });
  if (offer.listing_id !== body.listing_id) {
    return json(400, { ok: false, error: 'offer_listing_mismatch' });
  }

  // Step 7: idempotency — return cached score if fresh.
  if (
    typeof offer.ai_match_score === 'number' &&
    offer.ai_match_score_at &&
    Date.now() - Date.parse(offer.ai_match_score_at as string) < IDEMPOTENCY_WINDOW_MS
  ) {
    return json(200, {
      ok: true,
      score: Number(offer.ai_match_score),
      cached: true,
      computed_at: offer.ai_match_score_at,
    });
  }

  // Step 8: load listing.
  const { data: listing, error: listingErr } = await admin
    .from('marketplace_listings')
    .select(
      'id, vendor_tenant_id, vertical, city_id, delivery_window_start, delivery_window_end, pickup_address, dropoff_address, package_description, package_weight_grams, package_temperature',
    )
    .eq('id', body.listing_id)
    .maybeSingle();
  if (listingErr) {
    console.error('[ai-marketplace-match-score] listing lookup failed:', listingErr.message);
    return json(500, { ok: false, error: 'listing_lookup_failed' });
  }
  if (!listing) return json(404, { ok: false, error: 'listing_not_found' });

  // Step 9: load fleet aggregate (best-effort — missing = treated as no-history).
  let fleetAvgRating: number | null = null;
  let fleetDisputeCount = 0;
  let fleetTotalMatches = 0;
  const { data: agg } = await admin
    .from('fleet_aggregate_scores')
    .select('avg_rating, dispute_count, total_matches')
    .eq('fleet_id', offer.fleet_id)
    .maybeSingle();
  if (agg) {
    fleetAvgRating =
      typeof agg.avg_rating === 'number' || typeof agg.avg_rating === 'string'
        ? Number(agg.avg_rating)
        : null;
    fleetDisputeCount = Number(agg.dispute_count ?? 0);
    fleetTotalMatches = Number(agg.total_matches ?? 0);
  }

  // Step 10: derive distance from pickup/dropoff jsonb.
  const pickup = extractLatLng(
    isPlainObject(listing.pickup_address) ? listing.pickup_address : null,
  );
  const dropoff = extractLatLng(
    isPlainObject(listing.dropoff_address) ? listing.dropoff_address : null,
  );
  const distanceKm = haversineKm(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);

  // Step 11: enqueue ai_jobs row (PENDING) for audit + replay.
  const inputPayload = {
    listing_id: body.listing_id,
    offer_id: body.offer_id,
    fleet_id: offer.fleet_id,
    vertical: listing.vertical,
    city_id: listing.city_id,
    distance_km: distanceKm,
    offered_price_cents: offer.offered_price_cents,
    eta_minutes: offer.eta_minutes,
  };
  const { data: jobRow, error: jobInsErr } = await admin
    .from('ai_jobs')
    .insert({
      job_type: 'marketplace_match_score',
      tenant_id: listing.vendor_tenant_id,
      input_payload: inputPayload,
      status: 'RUNNING',
      model_used: MODEL,
      started_at: new Date().toISOString(),
      metadata: { actor_user_id: user.id },
    })
    .select('id')
    .single();
  if (jobInsErr || !jobRow) {
    console.error('[ai-marketplace-match-score] ai_jobs insert failed:', jobInsErr?.message);
    // Non-fatal: still attempt scoring without audit row.
  }
  const jobId = jobRow?.id as string | undefined;

  // Step 12: build prompt + call Anthropic.
  const userMessage = buildUserMessage({
    vertical: listing.vertical as string,
    cityId: (listing.city_id as string | null) ?? null,
    pickup,
    dropoff,
    distanceKm,
    packageDescription: (listing.package_description as string | null) ?? null,
    packageTemperature: (listing.package_temperature as string | null) ?? null,
    packageWeightGrams: (listing.package_weight_grams as number | null) ?? null,
    deliveryWindowStart: listing.delivery_window_start as string,
    deliveryWindowEnd: listing.delivery_window_end as string,
    offeredPriceCents: Number(offer.offered_price_cents),
    etaMinutes: Number(offer.eta_minutes),
    offerFleetRating:
      typeof offer.fleet_rating === 'number' || typeof offer.fleet_rating === 'string'
        ? Number(offer.fleet_rating)
        : null,
    fleetAvgRating,
    fleetDisputeCount,
    fleetTotalMatches,
  });

  let llmResult: AnthropicCallResult;
  try {
    llmResult = await callAnthropic(ANTHROPIC_KEY, SYSTEM_PROMPT, userMessage);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ai-marketplace-match-score] anthropic call failed:', msg);
    if (jobId) {
      await admin
        .from('ai_jobs')
        .update({
          status: 'FAILED',
          error_text: msg.slice(0, 500),
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    }
    return json(500, { ok: false, error: 'anthropic_failure', breadcrumb: msg.slice(0, 120) });
  }

  // Step 13: parse + persist.
  const scored = parseScoreOutput(llmResult.text);
  if (!scored) {
    if (jobId) {
      await admin
        .from('ai_jobs')
        .update({
          status: 'FAILED',
          error_text: `parse_failed: ${llmResult.text.slice(0, 300)}`,
          completed_at: new Date().toISOString(),
          input_tokens: llmResult.inputTokens,
          output_tokens: llmResult.outputTokens,
        })
        .eq('id', jobId);
    }
    return json(500, { ok: false, error: 'anthropic_output_parse_failed' });
  }

  // Cache on the offer row (used by vendor UI for sorting).
  await admin
    .from('marketplace_offers')
    .update({
      ai_match_score: scored.score,
      ai_match_score_at: new Date().toISOString(),
    })
    .eq('id', body.offer_id);

  if (jobId) {
    await admin
      .from('ai_jobs')
      .update({
        status: 'COMPLETED',
        output_payload: scored,
        input_tokens: llmResult.inputTokens,
        output_tokens: llmResult.outputTokens,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);
  }

  return json(200, {
    ok: true,
    score: scored.score,
    factors: scored.factors,
    reasoning: scored.reasoning,
    model_version: MODEL,
    cached: false,
    computed_at: new Date().toISOString(),
  });
});
