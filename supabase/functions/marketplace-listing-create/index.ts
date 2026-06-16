// Edge Function: marketplace-listing-create
//
// B2B Marketplace foundation 2026-06-16 — gated by HIR_FEATURE_MARKETPLACE_ENABLED.
// Strategy Master Plan Section 5 (B2B Marketplace), Stream 2/9.
//
// Contract: POST application/json
//   Authorization: Bearer <user JWT>
//   Body:
//     {
//       vendor_tenant_id: uuid,                                  // required
//       vertical: 'restaurant'|'pharmacy'|'retail'|'other',     // required
//       delivery_window_start: ISO timestamp,                    // required
//       delivery_window_end: ISO timestamp,                      // required, > start
//       pickup_address: object,                                  // required
//       dropoff_address: object,                                 // required, NO full PII
//       package_description: string,                             // required
//       city_id?: uuid,
//       package_weight_grams?: number,
//       package_temperature?: 'ambient'|'chilled'|'frozen',
//       customer_phone_redacted?: string,                        // GDPR: redacted only
//       publish?: boolean,                                       // true => status='OPEN'
//       client_idempotency_key?: string                          // dedupe window: 1h
//     }
//
// Response:
//   200 { ok: true, listing_id, status }
//   400 invalid input | 401 unauthenticated | 403 not tenant member
//   503 feature off | 500 db / env error
//
// Anti-disintermediation pillar 5 (GDPR): dropoff_address must contain only
// pickup-point fields (street/area/zone/notes/lat/lng). Reject if it carries
// customer PII keys (name, full_name, email, phone, contact, customer_*).
// Customer phone, when needed, must come via the dedicated
// customer_phone_redacted field (e.g. "+407*****89").

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type Vertical = 'restaurant' | 'pharmacy' | 'retail' | 'other';
type Temperature = 'ambient' | 'chilled' | 'frozen';
type ListingStatus = 'DRAFT' | 'OPEN';

const VALID_VERTICALS: Vertical[] = ['restaurant', 'pharmacy', 'retail', 'other'];
const VALID_TEMPS: Temperature[] = ['ambient', 'chilled', 'frozen'];

const MAX_DESCRIPTION_CHARS = 2000;
const MAX_PHONE_REDACTED_CHARS = 32;
const MAX_PACKAGE_WEIGHT_GRAMS = 50_000; // 50kg practical ceiling
const IDEMPOTENCY_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Keys forbidden in dropoff_address (anti-disintermediation pillar 5 / GDPR).
const FORBIDDEN_DROPOFF_PII_KEYS = new Set<string>([
  'name',
  'full_name',
  'fullname',
  'first_name',
  'last_name',
  'email',
  'phone',
  'phone_number',
  'mobile',
  'contact',
  'contact_name',
  'contact_phone',
  'customer',
  'customer_name',
  'customer_email',
  'customer_phone',
  'recipient_name',
  'recipient_phone',
  'recipient_email',
]);

// Allowed top-level keys in pickup/dropoff_address jsonb (whitelist).
const ALLOWED_ADDRESS_KEYS = new Set<string>([
  'street',
  'street_line',
  'street_line_1',
  'street_line_2',
  'number',
  'building',
  'apartment',
  'floor',
  'area',
  'zone',
  'neighborhood',
  'district',
  'city',
  'county',
  'postal_code',
  'country',
  'lat',
  'lng',
  'latitude',
  'longitude',
  'notes',
  'landmark',
]);

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

type AddressValidation = { ok: true } | { ok: false; error: string };

function validateAddress(
  addr: Record<string, unknown>,
  opts: { forbidPii: boolean },
): AddressValidation {
  const keys = Object.keys(addr);
  if (keys.length === 0) return { ok: false, error: 'address_empty' };

  for (const key of keys) {
    const lower = key.toLowerCase();
    if (opts.forbidPii && FORBIDDEN_DROPOFF_PII_KEYS.has(lower)) {
      return { ok: false, error: `dropoff_address_pii_forbidden:${lower}` };
    }
    if (!ALLOWED_ADDRESS_KEYS.has(lower)) {
      return { ok: false, error: `address_key_not_allowed:${lower}` };
    }
  }
  return { ok: true };
}

interface ParsedBody {
  vendor_tenant_id: string;
  vertical: Vertical;
  city_id: string | null;
  delivery_window_start: string;
  delivery_window_end: string;
  pickup_address: Record<string, unknown>;
  dropoff_address: Record<string, unknown>;
  package_description: string;
  package_weight_grams: number | null;
  package_temperature: Temperature | null;
  customer_phone_redacted: string | null;
  publish: boolean;
  client_idempotency_key: string | null;
}

type ParseResult = { ok: true; body: ParsedBody } | { ok: false; error: string };

function parseBody(raw: unknown): ParseResult {
  if (!isPlainObject(raw)) return { ok: false, error: 'body_not_object' };

  if (!isUuid(raw.vendor_tenant_id)) return { ok: false, error: 'vendor_tenant_id_invalid' };
  if (typeof raw.vertical !== 'string' || !VALID_VERTICALS.includes(raw.vertical as Vertical)) {
    return { ok: false, error: 'vertical_invalid' };
  }
  if (!isIsoTimestamp(raw.delivery_window_start)) {
    return { ok: false, error: 'delivery_window_start_invalid' };
  }
  if (!isIsoTimestamp(raw.delivery_window_end)) {
    return { ok: false, error: 'delivery_window_end_invalid' };
  }
  const startMs = Date.parse(raw.delivery_window_start as string);
  const endMs = Date.parse(raw.delivery_window_end as string);
  if (endMs <= startMs) return { ok: false, error: 'delivery_window_end_must_be_after_start' };

  if (!isPlainObject(raw.pickup_address)) return { ok: false, error: 'pickup_address_invalid' };
  if (!isPlainObject(raw.dropoff_address)) return { ok: false, error: 'dropoff_address_invalid' };

  const pickupCheck = validateAddress(raw.pickup_address, { forbidPii: false });
  if (!pickupCheck.ok) return { ok: false, error: `pickup_${pickupCheck.error}` };

  const dropoffCheck = validateAddress(raw.dropoff_address, { forbidPii: true });
  if (!dropoffCheck.ok) return { ok: false, error: dropoffCheck.error };

  if (typeof raw.package_description !== 'string') {
    return { ok: false, error: 'package_description_required' };
  }
  const desc = raw.package_description.slice(0, MAX_DESCRIPTION_CHARS).trim();
  if (desc.length === 0) return { ok: false, error: 'package_description_empty' };

  let cityId: string | null = null;
  if (raw.city_id !== undefined && raw.city_id !== null) {
    if (!isUuid(raw.city_id)) return { ok: false, error: 'city_id_invalid' };
    cityId = raw.city_id;
  }

  let weight: number | null = null;
  if (raw.package_weight_grams !== undefined && raw.package_weight_grams !== null) {
    if (
      typeof raw.package_weight_grams !== 'number' ||
      !Number.isFinite(raw.package_weight_grams) ||
      !Number.isInteger(raw.package_weight_grams) ||
      raw.package_weight_grams < 0 ||
      raw.package_weight_grams > MAX_PACKAGE_WEIGHT_GRAMS
    ) {
      return { ok: false, error: 'package_weight_grams_invalid' };
    }
    weight = raw.package_weight_grams;
  }

  let temp: Temperature | null = null;
  if (raw.package_temperature !== undefined && raw.package_temperature !== null) {
    if (
      typeof raw.package_temperature !== 'string' ||
      !VALID_TEMPS.includes(raw.package_temperature as Temperature)
    ) {
      return { ok: false, error: 'package_temperature_invalid' };
    }
    temp = raw.package_temperature as Temperature;
  }

  let phoneRedacted: string | null = null;
  if (raw.customer_phone_redacted !== undefined && raw.customer_phone_redacted !== null) {
    if (typeof raw.customer_phone_redacted !== 'string') {
      return { ok: false, error: 'customer_phone_redacted_invalid' };
    }
    const trimmed = raw.customer_phone_redacted.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_PHONE_REDACTED_CHARS) {
      return { ok: false, error: 'customer_phone_redacted_invalid' };
    }
    // Must contain a redaction marker (asterisks/X) — full numbers are PII and
    // must not be persisted here. Enforces pillar 5.
    if (!/[*xX•]/.test(trimmed)) {
      return { ok: false, error: 'customer_phone_must_be_redacted' };
    }
    phoneRedacted = trimmed;
  }

  const publish = raw.publish === true;

  let idemKey: string | null = null;
  if (raw.client_idempotency_key !== undefined && raw.client_idempotency_key !== null) {
    if (
      typeof raw.client_idempotency_key !== 'string' ||
      raw.client_idempotency_key.length === 0 ||
      raw.client_idempotency_key.length > 128
    ) {
      return { ok: false, error: 'client_idempotency_key_invalid' };
    }
    idemKey = raw.client_idempotency_key;
  }

  return {
    ok: true,
    body: {
      vendor_tenant_id: raw.vendor_tenant_id,
      vertical: raw.vertical as Vertical,
      city_id: cityId,
      delivery_window_start: raw.delivery_window_start as string,
      delivery_window_end: raw.delivery_window_end as string,
      pickup_address: raw.pickup_address,
      dropoff_address: raw.dropoff_address,
      package_description: desc,
      package_weight_grams: weight,
      package_temperature: temp,
      customer_phone_redacted: phoneRedacted,
      publish,
      client_idempotency_key: idemKey,
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
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }
  const parsed = parseBody(rawBody);
  if (!parsed.ok) return json(400, { ok: false, error: parsed.error });
  const body = parsed.body;

  // Service-role client for membership check + insert (same pattern as
  // feedback-intake / lib/tenant.ts — service_role bypasses RLS so we
  // explicitly verify membership server-side).
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Step 4: verify caller is tenant_member of vendor_tenant_id.
  const { data: member, error: memberErr } = await admin
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('tenant_id', body.vendor_tenant_id)
    .maybeSingle();
  if (memberErr) {
    console.error('[marketplace-listing-create] membership lookup failed:', memberErr.message);
    return json(500, { ok: false, error: 'membership_check_failed' });
  }
  if (!member) return json(403, { ok: false, error: 'not_tenant_member' });

  // Step 9: idempotency — if client_idempotency_key present, return existing
  // listing created by this vendor within the last hour with the same key.
  if (body.client_idempotency_key) {
    const sinceIso = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS).toISOString();
    const { data: existing, error: existingErr } = await admin
      .from('marketplace_listings')
      .select('id, status')
      .eq('vendor_tenant_id', body.vendor_tenant_id)
      .eq('metadata->>idempotency_key', body.client_idempotency_key)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingErr) {
      console.error('[marketplace-listing-create] idempotency lookup failed:', existingErr.message);
      // Non-fatal — fall through to insert.
    } else if (existing) {
      return json(200, {
        ok: true,
        listing_id: existing.id,
        status: existing.status,
        idempotent_replay: true,
      });
    }
  }

  // Step 6/7: INSERT row. Status = OPEN if publish=true else DRAFT.
  const status: ListingStatus = body.publish ? 'OPEN' : 'DRAFT';
  const metadata: Record<string, unknown> = {
    created_by_user_id: user.id,
  };
  if (body.client_idempotency_key) {
    metadata.idempotency_key = body.client_idempotency_key;
  }

  const { data: inserted, error: insErr } = await admin
    .from('marketplace_listings')
    .insert({
      vendor_tenant_id: body.vendor_tenant_id,
      vertical: body.vertical,
      city_id: body.city_id,
      delivery_window_start: body.delivery_window_start,
      delivery_window_end: body.delivery_window_end,
      pickup_address: body.pickup_address,
      dropoff_address: body.dropoff_address,
      package_description: body.package_description,
      package_weight_grams: body.package_weight_grams,
      package_temperature: body.package_temperature,
      customer_phone_redacted: body.customer_phone_redacted,
      status,
      is_financial_record: false,
      metadata,
    })
    .select('id, status')
    .single();
  if (insErr || !inserted) {
    console.error('[marketplace-listing-create] insert failed:', insErr?.message);
    return json(500, { ok: false, error: 'insert_failed' });
  }

  // Step 8: success.
  return json(200, {
    ok: true,
    listing_id: inserted.id as string,
    status: inserted.status as ListingStatus,
  });
});
