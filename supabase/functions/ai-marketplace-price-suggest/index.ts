// Edge Function: ai-marketplace-price-suggest
//
// B2B Marketplace Stream 3 (AI matching engine) — real implementation.
// Replaces the 503 stub from the strategy scaffolding. Gated by
// HIR_FEATURE_AI_MATCHING_ENABLED. Strategy Master Plan Section 6 (AI
// Integration). Job type: marketplace_price_suggest.
//
// Purpose: suggest a fair-price range (low/mid/high in RON) for a new
// listing the vendor is about to publish, based on the last 90 days of
// matched deliveries in the same vertical+city. The vendor UI shows this
// inline as the form is filled — anchors expectations without committing
// the vendor to a specific number.
//
// Model: claude-sonnet-4-6 (same tier as ai-marketplace-match-score —
// structured suggestion, not deep reasoning). Sampling params removed on
// Sonnet 4.6 per API contract.
//
// Contract: POST application/json
//   Body:
//     {
//       vertical: 'restaurant'|'pharmacy'|'retail'|'other',
//       city_id?: uuid,
//       pickup_lat?: number, pickup_lng?: number,
//       dropoff_lat?: number, dropoff_lng?: number,
//       package_kg?: number,
//       urgent_min?: number   // minutes from publish to required pickup
//     }
//
// Response:
//   200 { ok: true, suggested: { low_ron, mid_ron, high_ron }, rationale,
//        market_samples, model_version }
//   400 invalid body | 401 unauthenticated | 503 feature off | 500 anthropic
//   failure | env_missing
//
// Idempotency: this endpoint is read-only on Anthropic's side (we don't
// persist a per-call cache because the inputs are listing draft state, not
// a stable entity ID). Cost is bounded by the system prompt + ~150 input
// tokens + ~200 output tokens per call. Vendor UI debounces typing.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 500;
const HISTORY_DAYS = 90;
const HISTORY_LIMIT = 60; // recent samples sent to model — keeps input token cost bounded

const VALID_VERTICALS = new Set(['restaurant', 'pharmacy', 'retail', 'other']);

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

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
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

interface ParsedBody {
  vertical: string;
  city_id: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  package_kg: number | null;
  urgent_min: number | null;
  distance_km: number | null;
}

type ParseResult = { ok: true; body: ParsedBody } | { ok: false; error: string };

function parseBody(raw: unknown): ParseResult {
  if (!isPlainObject(raw)) return { ok: false, error: 'body_not_object' };

  if (typeof raw.vertical !== 'string' || !VALID_VERTICALS.has(raw.vertical)) {
    return { ok: false, error: 'vertical_invalid' };
  }

  let cityId: string | null = null;
  if (raw.city_id !== undefined && raw.city_id !== null) {
    if (!isUuid(raw.city_id)) return { ok: false, error: 'city_id_invalid' };
    cityId = raw.city_id;
  }

  const optionalCoord = (v: unknown, name: string): number | null | string => {
    if (v === undefined || v === null) return null;
    if (!isFiniteNumber(v)) return `${name}_invalid`;
    return v;
  };

  const pickupLat = optionalCoord(raw.pickup_lat, 'pickup_lat');
  if (typeof pickupLat === 'string') return { ok: false, error: pickupLat };
  const pickupLng = optionalCoord(raw.pickup_lng, 'pickup_lng');
  if (typeof pickupLng === 'string') return { ok: false, error: pickupLng };
  const dropoffLat = optionalCoord(raw.dropoff_lat, 'dropoff_lat');
  if (typeof dropoffLat === 'string') return { ok: false, error: dropoffLat };
  const dropoffLng = optionalCoord(raw.dropoff_lng, 'dropoff_lng');
  if (typeof dropoffLng === 'string') return { ok: false, error: dropoffLng };

  let packageKg: number | null = null;
  if (raw.package_kg !== undefined && raw.package_kg !== null) {
    if (!isFiniteNumber(raw.package_kg) || raw.package_kg < 0 || raw.package_kg > 50) {
      return { ok: false, error: 'package_kg_invalid' };
    }
    packageKg = raw.package_kg;
  }

  let urgentMin: number | null = null;
  if (raw.urgent_min !== undefined && raw.urgent_min !== null) {
    if (!isFiniteNumber(raw.urgent_min) || raw.urgent_min < 0 || raw.urgent_min > 24 * 60) {
      return { ok: false, error: 'urgent_min_invalid' };
    }
    urgentMin = raw.urgent_min;
  }

  let distanceKm: number | null = null;
  if (pickupLat !== null && pickupLng !== null && dropoffLat !== null && dropoffLng !== null) {
    distanceKm = haversineKm(pickupLat, pickupLng, dropoffLat, dropoffLng);
  }

  return {
    ok: true,
    body: {
      vertical: raw.vertical,
      city_id: cityId,
      pickup_lat: pickupLat,
      pickup_lng: pickupLng,
      dropoff_lat: dropoffLat,
      dropoff_lng: dropoffLng,
      package_kg: packageKg,
      urgent_min: urgentMin,
      distance_km: distanceKm,
    },
  };
}

interface PriceOutput {
  low_ron: number;
  mid_ron: number;
  high_ron: number;
  rationale: string;
}

function clampPositiveRon(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 10000) return 10000; // sanity ceiling
  return Math.round(v);
}

function parsePriceOutput(text: string): PriceOutput | null {
  const stripped = text.trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;

  const low = Number(parsed.low_ron);
  const mid = Number(parsed.mid_ron);
  const high = Number(parsed.high_ron);
  const rationale = parsed.rationale;

  if (!Number.isFinite(low) || !Number.isFinite(mid) || !Number.isFinite(high)) return null;
  if (typeof rationale !== 'string') return null;

  return {
    low_ron: clampPositiveRon(low),
    mid_ron: clampPositiveRon(mid),
    high_ron: clampPositiveRon(high),
    rationale: rationale.slice(0, 500),
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

const SYSTEM_PROMPT = `You are a delivery-pricing analyst for HIR's B2B marketplace in Romania. You receive a draft listing's vertical/city/distance/weight and a small sample of recently-matched deliveries (last 90 days, same vertical, same city when available). Suggest a fair price RANGE in RON the vendor should expect to pay a fleet for this delivery.

Output STRICT JSON only — no prose preamble, no markdown fences. Shape:
{
  "low_ron": <integer whole-RON — 25th percentile of comparable matches>,
  "mid_ron": <integer whole-RON — median of comparable matches>,
  "high_ron": <integer whole-RON — 75th percentile, or the price needed during peak/urgent>,
  "rationale": "<one short sentence the vendor sees as a tooltip — e.g. 'Based on 12 similar pharmacy deliveries in this city this week'>"
}

Rules:
  - Always low_ron <= mid_ron <= high_ron.
  - If you have fewer than 3 comparable samples, widen the range and say so in rationale.
  - If the package is heavy (>5kg) or urgent (<60min window), bias toward the upper end of the historical range.
  - Pharmacy and restaurant typically cluster 15-50 RON; retail 25-80 RON; other varies.
  - Whole-RON granularity only — settlement does bani-level math; this is a vendor-facing anchor.`;

interface MarketSample {
  vertical: string;
  final_price_cents: number;
  matched_at: string;
}

function buildUserMessage(ctx: {
  body: ParsedBody;
  samples: MarketSample[];
}): string {
  const sampleLines =
    ctx.samples.length > 0
      ? ctx.samples
          .map(
            (s) =>
              `  - ${s.vertical}: ${(s.final_price_cents / 100).toFixed(0)} RON (${s.matched_at.slice(0, 10)})`,
          )
          .join('\n')
      : '  (no historical samples available)';

  return [
    `DRAFT LISTING:`,
    `  vertical: ${ctx.body.vertical}`,
    `  city_id: ${ctx.body.city_id ?? '(unspecified)'}`,
    `  distance_km: ${ctx.body.distance_km !== null ? ctx.body.distance_km.toFixed(2) : '(unknown)'}`,
    `  package_kg: ${ctx.body.package_kg ?? '(unspecified)'}`,
    `  urgent_min: ${ctx.body.urgent_min ?? '(unspecified)'}`,
    ``,
    `MARKET CONTEXT (last ${HISTORY_DAYS} days, same vertical${ctx.body.city_id ? ' + same city' : ''}, up to ${HISTORY_LIMIT} most recent):`,
    sampleLines,
    `  total_samples: ${ctx.samples.length}`,
    ``,
    `Suggest a price range. Respond with STRICT JSON only.`,
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

  // Step 5: service-role client.
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Step 6: fetch market context — last 90 days of matched deliveries in
  // same vertical (+ same city when available). Joined via listing → match.
  const sinceIso = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  let query = admin
    .from('marketplace_matches')
    .select(
      'final_price_cents, matched_at, listing:marketplace_listings!inner(vertical, city_id)',
    )
    .gte('matched_at', sinceIso)
    .eq('listing.vertical', body.vertical)
    .order('matched_at', { ascending: false })
    .limit(HISTORY_LIMIT);

  if (body.city_id) {
    query = query.eq('listing.city_id', body.city_id);
  }

  const { data: matches, error: matchErr } = await query;
  if (matchErr) {
    console.error('[ai-marketplace-price-suggest] market lookup failed:', matchErr.message);
    return json(500, { ok: false, error: 'market_lookup_failed' });
  }

  const samples: MarketSample[] = (matches ?? [])
    .map((row): MarketSample | null => {
      const listingRaw = (row as { listing?: unknown }).listing;
      const listing = Array.isArray(listingRaw) ? listingRaw[0] : listingRaw;
      if (!isPlainObject(listing)) return null;
      const vertical = listing.vertical;
      if (typeof vertical !== 'string') return null;
      const priceCents = (row as { final_price_cents?: unknown }).final_price_cents;
      const matchedAt = (row as { matched_at?: unknown }).matched_at;
      if (typeof priceCents !== 'number' || typeof matchedAt !== 'string') return null;
      return {
        vertical,
        final_price_cents: priceCents,
        matched_at: matchedAt,
      };
    })
    .filter((s): s is MarketSample => s !== null);

  // Step 7: enqueue ai_jobs row.
  const inputPayload = {
    vertical: body.vertical,
    city_id: body.city_id,
    distance_km: body.distance_km,
    package_kg: body.package_kg,
    urgent_min: body.urgent_min,
    sample_count: samples.length,
  };
  const { data: jobRow, error: jobInsErr } = await admin
    .from('ai_jobs')
    .insert({
      job_type: 'marketplace_price_suggest',
      input_payload: inputPayload,
      status: 'RUNNING',
      model_used: MODEL,
      started_at: new Date().toISOString(),
      metadata: { actor_user_id: user.id },
    })
    .select('id')
    .single();
  if (jobInsErr || !jobRow) {
    console.error('[ai-marketplace-price-suggest] ai_jobs insert failed:', jobInsErr?.message);
  }
  const jobId = jobRow?.id as string | undefined;

  // Step 8: call Anthropic.
  const userMessage = buildUserMessage({ body, samples });

  let llmResult: AnthropicCallResult;
  try {
    llmResult = await callAnthropic(ANTHROPIC_KEY, SYSTEM_PROMPT, userMessage);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ai-marketplace-price-suggest] anthropic call failed:', msg);
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

  // Step 9: parse + clamp.
  const suggested = parsePriceOutput(llmResult.text);
  if (!suggested) {
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

  // Enforce monotonicity defensively (model is instructed but we double-check).
  const lowOut = Math.min(suggested.low_ron, suggested.mid_ron, suggested.high_ron);
  const highOut = Math.max(suggested.low_ron, suggested.mid_ron, suggested.high_ron);
  const midOut = Math.min(Math.max(suggested.mid_ron, lowOut), highOut);

  const output = {
    low_ron: lowOut,
    mid_ron: midOut,
    high_ron: highOut,
    rationale: suggested.rationale,
    market_samples: samples.length,
  };

  if (jobId) {
    await admin
      .from('ai_jobs')
      .update({
        status: 'COMPLETED',
        output_payload: output,
        input_tokens: llmResult.inputTokens,
        output_tokens: llmResult.outputTokens,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);
  }

  return json(200, {
    ok: true,
    suggested: {
      low_ron: lowOut,
      mid_ron: midOut,
      high_ron: highOut,
    },
    rationale: suggested.rationale,
    market_samples: samples.length,
    model_version: MODEL,
  });
});
