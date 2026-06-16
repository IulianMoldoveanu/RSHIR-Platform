// Edge Function: permit-verify-submit
//
// Stream EDGE-2 — HIR PASIV M0-M24 work-permit submission for non-EU couriers.
// Pairs with migration 20260616_014_non_eu_permit_verify.sql.
//
// VISION LOCKED 2026-06-16 (board verdict §11.5 PASIV M0-M24):
//   HIR only verifies an EXISTING IGI-issued permit; it does NOT acquire one
//   on behalf of the courier (no recruitment-agency role until 2028 AIRO /
//   GlobalWorker partnership). This endpoint captures the courier's
//   submission and queues it for platform admin review.
//
// Contract: POST application/json
//   Authorization: Bearer <user JWT>  (courier OR platform admin)
//   Body:
//     {
//       courier_user_id:          uuid
//       permit_country_iso:       string  // ISO 3166-1 alpha-3 (NPL, IND, ...)
//       permit_munca_valid_until: string  // YYYY-MM-DD (must be in the future)
//       permit_doc_url:           string  // storage path
//     }
//
// Authorization rules:
//   - The caller can submit FOR HIMSELF (auth.uid() === courier_user_id), OR
//   - The caller is a platform_admin (admin acts on behalf of the courier).
//
// Status semantics:
//   - The UPSERT writes the permit fields and FORCES permit_status='PENDING'
//     (admin reviewers flip it to VERIFIED / REJECTED via the existing
//     verifications dashboard).
//   - is_non_eu_resident is set to TRUE on submission (a courier submitting a
//     permit is, by definition, non-EU). The DB CHECK constraint
//     courier_profiles_non_eu_required_fields_chk requires permit_country_iso
//     + permit_munca_valid_until + permit_doc_url to be present when leaving
//     PENDING — we accept PENDING with all three present, which satisfies it.
//
// Response:
//   200 { ok: true, courier_user_id, permit_status, audit_log_id? }
//   400 invalid input
//   401 unauthenticated
//   403 forbidden (caller is neither self nor admin)
//   404 courier_profile not found
//   500 db error
//   503 feature off
//
// CLAUDE.md §5 anti-regression compliance:
//   - Zero `as any`. Strict typing throughout.
//   - Feature flag HIR_FEATURE_NON_EU_PERMIT_VERIFY_ENABLED gates the entire fn.
//   - Audit log is written transparently by the existing
//     trg_log_courier_permit_change trigger on courier_profiles (no manual
//     INSERT into courier_permit_audit_log here — the trigger keeps history
//     immutable and the actor_user_id reliable through auth.uid()).
//   - permit_status is NEVER allowed to be set by the caller; the endpoint
//     always coerces it to PENDING. Admin transitions VERIFIED/REJECTED happen
//     via the dedicated admin path (server action / dashboard), not here.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { z } from 'https://esm.sh/zod@3.23.8';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALPHA3_RE = /^[A-Z]{3}$/;

const bodySchema = z.object({
  courier_user_id: z.string().trim().regex(UUID_RE, 'courier_user_id_invalid'),
  permit_country_iso: z
    .string()
    .trim()
    .toUpperCase()
    .regex(ALPHA3_RE, 'permit_country_iso_invalid'),
  permit_munca_valid_until: z
    .string()
    .trim()
    .regex(ISO_DATE_RE, 'permit_munca_valid_until_invalid'),
  permit_doc_url: z.string().trim().min(1).max(2048),
});

type ParsedBody = z.infer<typeof bodySchema>;

// ---------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------
const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isFutureDate(ymd: string): boolean {
  const ts = Date.parse(`${ymd}T00:00:00Z`);
  if (!Number.isFinite(ts)) return false;
  const todayUtc = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return ts >= todayUtc;
}

async function isPlatformAdmin(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[permit-verify-submit] platform_admins lookup failed:', error.message);
    return false;
  }
  return Boolean(data);
}

interface CourierRow {
  user_id: string;
}

async function fetchCourierProfile(
  admin: SupabaseClient,
  courierUserId: string,
): Promise<CourierRow | null> {
  const { data, error } = await admin
    .from('courier_profiles')
    .select('user_id')
    .eq('user_id', courierUserId)
    .maybeSingle();
  if (error) {
    console.error('[permit-verify-submit] courier_profiles lookup failed:', error.message);
    return null;
  }
  return (data as CourierRow | null) ?? null;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (Deno.env.get('HIR_FEATURE_NON_EU_PERMIT_VERIFY_ENABLED') !== 'true') {
    return json(503, { ok: false, error: 'non_eu_permit_verify_feature_not_enabled' });
  }

  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(500, { ok: false, error: 'supabase_env_missing' });
  }

  // ── 1. Bearer JWT ────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!token) return json(401, { ok: false, error: 'missing_bearer' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userRes, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userRes?.user) return json(401, { ok: false, error: 'invalid_token' });
  const callerUserId = userRes.user.id;

  // ── 2. Parse + validate JSON ─────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return json(400, {
      ok: false,
      error: 'invalid_input',
      issues: parsed.error.issues,
    });
  }
  const body: ParsedBody = parsed.data;

  // Business rule: validity date must be today or later.
  if (!isFutureDate(body.permit_munca_valid_until)) {
    return json(400, { ok: false, error: 'permit_munca_valid_until_must_be_future' });
  }

  // ── 3. Authorization: self OR platform_admin ─────────────────────────
  const isSelf = callerUserId === body.courier_user_id;
  const isAdmin = isSelf ? false : await isPlatformAdmin(admin, callerUserId);
  if (!isSelf && !isAdmin) {
    return json(403, { ok: false, error: 'forbidden_not_self_nor_admin' });
  }

  // ── 4. Courier must exist (FK guard before UPSERT) ───────────────────
  const courier = await fetchCourierProfile(admin, body.courier_user_id);
  if (!courier) return json(404, { ok: false, error: 'courier_profile_not_found' });

  // ── 5. UPSERT permit fields. Force permit_status='PENDING'. ──────────
  // We UPDATE the existing courier_profiles row (PK = user_id). is_non_eu_resident
  // is set to TRUE; the audit trigger fires automatically on permit_status
  // transitions. If the row was already PENDING, the trigger no-ops on status
  // (DISTINCT FROM check), but the permit document/country/expiry fields are
  // refreshed — that's the desired "courier re-submits with updated permit"
  // behaviour.
  const { error: updateErr } = await admin
    .from('courier_profiles')
    .update({
      is_non_eu_resident: true,
      permit_country_iso: body.permit_country_iso,
      permit_munca_valid_until: body.permit_munca_valid_until,
      permit_doc_url: body.permit_doc_url,
      permit_status: 'PENDING',
      // Clear any previous reviewer attribution — the resubmission resets the
      // queue. Admin will re-fill these on VERIFY/REJECT.
      permit_verified_by: null,
      permit_verified_at: null,
    })
    .eq('user_id', body.courier_user_id);

  if (updateErr) {
    console.error('[permit-verify-submit] update failed:', updateErr.message);
    return json(500, { ok: false, error: 'permit_update_failed' });
  }

  // ── 6. Return current status (trigger handled audit log row) ─────────
  return json(200, {
    ok: true,
    courier_user_id: body.courier_user_id,
    permit_status: 'PENDING',
    submitted_by: isAdmin ? 'admin' : 'self',
  });
});
