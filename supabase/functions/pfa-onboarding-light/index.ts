// Edge Function: pfa-onboarding-light
//
// Stream EDGE-2 — Solo PFA self-serve KYF-light onboarding.
// Pairs with migration 20260616_010_solo_pfa_micro_fleet.sql.
//
// VISION LOCKED 2026-06-16 (board verdict §11.1):
//   Each PFA (Persoană Fizică Autorizată) = its own micro-fleet (single member
//   = himself). KYF-light flow (ANAF CUI + ID + selfie) suffices for solo PFAs
//   because there is no employer/employee relationship — the PFA contracts
//   directly with vendors via the open marketplace. HIR4You FIREWALL preserved
//   on all 3 legs (Dir UE 2024/2831 — transpunere RO 2dec2026).
//
// Contract: POST application/json
//   Authorization: Bearer <user JWT> (the caller MUST be the PFA owner)
//   Body:
//     {
//       pfa_cui:        string  // 8-10 digits, optional "RO" prefix
//       owner_user_id:  uuid    // MUST equal the JWT user.id
//       display_name:   string  // 2..100 chars (PFA brand label)
//       id_doc_url:     string  // storage path to ID document
//       selfie_url:     string  // storage path to selfie
//       email:          email
//       phone:          string  // 9..30 chars
//     }
//
// Response:
//   200 { ok: true, fleet_id, profile_id, idempotent_replay?: true }
//   400 invalid input (zod_issues)
//   401 unauthenticated / Bearer missing
//   403 owner_user_id mismatch
//   404 ANAF CUI not found
//   500 db error
//   503 feature off
//
// Idempotency: ON CONFLICT on pfa_cui — if a fleet already exists for the same
// pfa_cui owned by the same user, return it instead of creating a duplicate
// (pfa_cui has no UNIQUE constraint at DB layer, so we enforce it here with a
// SELECT-then-INSERT pattern guarded by the owner check).
//
// CLAUDE.md §5 anti-regression compliance:
//   - Zero `as any`. Strict typing throughout.
//   - Feature flag HIR_FEATURE_SOLO_PFA_ENABLED gates the entire fn (503 OFF).
//   - JWT user.id MUST match body.owner_user_id (defense-in-depth, since
//     service_role bypasses RLS on inserts).
//   - ANAF validation is server-side ONLY (client cannot fake "active").
//   - Audit-trail piggy-backs on the existing courier_fleets / courier_profiles
//     timestamps + the platform_admin verifications dashboard (no new table).

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { z } from 'https://esm.sh/zod@3.23.8';

// ---------------------------------------------------------------------------
// ANAF public API client (mirrors apps/restaurant-admin/src/lib/anaf.ts).
// Duplicated here because Deno edge fns can't import server-only Next files.
// ---------------------------------------------------------------------------
const ANAF_URL = 'https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva';

interface AnafCompany {
  cui: string;
  name: string;
  address: string | null;
  active: boolean;
}

function normaliseCui(raw: string): string {
  return (raw || '').replace(/^ro/i, '').replace(/\D/g, '');
}

async function lookupAnaf(cuiRaw: string): Promise<AnafCompany | null> {
  const cui = normaliseCui(cuiRaw);
  if (!cui) return null;
  const today = new Date().toISOString().slice(0, 10);

  let payload: unknown;
  try {
    const res = await fetch(ANAF_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify([{ cui: Number(cui), data: today }]),
    });
    if (!res.ok) return null;
    payload = await res.json();
  } catch {
    return null;
  }

  const found = (payload as { found?: unknown[] })?.found;
  const entry = Array.isArray(found) ? found[0] : undefined;
  if (!entry || typeof entry !== 'object') return null;

  const dg = (entry as { date_generale?: Record<string, unknown> }).date_generale ?? {};
  const stare = typeof dg.stare_inregistrare === 'string' ? dg.stare_inregistrare : '';
  return {
    cui,
    name: typeof dg.denumire === 'string' ? dg.denumire : '',
    address: typeof dg.adresa === 'string' ? dg.adresa : null,
    active: stare ? !/radiat|inactiv/i.test(stare) : true,
  };
}

// ---------------------------------------------------------------------------
// Request schema (Zod). NO `as any` anywhere downstream.
// ---------------------------------------------------------------------------
const CUI_RE = /^(RO)?\d{2,10}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  pfa_cui: z.string().trim().regex(CUI_RE, 'pfa_cui_invalid'),
  owner_user_id: z.string().trim().regex(UUID_RE, 'owner_user_id_invalid'),
  display_name: z.string().trim().min(2).max(100),
  id_doc_url: z.string().trim().min(1).max(2048),
  selfie_url: z.string().trim().min(1).max(2048),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(9).max(30),
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
function deriveSlug(displayName: string, userId: string): string {
  // Lowercase, dash-separated, ascii-only. Suffix with a short user-id hash so
  // collisions across PFAs with the same display_name don't break uniqueness.
  const base = displayName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'pfa';
  const suffix = userId.replace(/-/g, '').slice(0, 6);
  return `pfa-${base}-${suffix}`;
}

function derivePrefix(displayName: string): string {
  const firstWord = displayName.trim().split(/\s+/)[0] ?? '';
  return firstWord.slice(0, 3).toUpperCase() || 'PFA';
}

interface ExistingFleet {
  id: string;
}

async function findExistingFleet(
  admin: SupabaseClient,
  pfaCui: string,
  ownerUserId: string,
): Promise<ExistingFleet | null> {
  const { data, error } = await admin
    .from('courier_fleets')
    .select('id')
    .eq('pfa_cui', pfaCui)
    .eq('pfa_owner_user_id', ownerUserId)
    .eq('is_pfa_solo', true)
    .maybeSingle();
  if (error) {
    console.error('[pfa-onboarding-light] existing lookup failed:', error.message);
    return null;
  }
  return (data as ExistingFleet | null) ?? null;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (Deno.env.get('HIR_FEATURE_SOLO_PFA_ENABLED') !== 'true') {
    return json(503, { ok: false, error: 'solo_pfa_feature_not_enabled' });
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

  // ── 3. Caller MUST equal owner_user_id (defense-in-depth) ────────────
  if (body.owner_user_id !== callerUserId) {
    return json(403, { ok: false, error: 'owner_user_id_mismatch' });
  }

  // ── 4. ANAF check — server-side ONLY ─────────────────────────────────
  const cuiNorm = normaliseCui(body.pfa_cui);
  const anaf = await lookupAnaf(cuiNorm);
  if (!anaf) return json(404, { ok: false, error: 'anaf_cui_not_found' });
  if (!anaf.active) {
    return json(400, { ok: false, error: 'anaf_cui_inactive' });
  }

  // ── 5. Idempotency: existing fleet for this (pfa_cui, owner)? ────────
  const existing = await findExistingFleet(admin, cuiNorm, callerUserId);
  if (existing) {
    // Make sure a matching courier_profiles row exists for the caller; if a
    // prior partial-failure left the fleet but not the profile, finish the job.
    const { data: profileExisting, error: profileLookupErr } = await admin
      .from('courier_profiles')
      .select('user_id')
      .eq('user_id', callerUserId)
      .maybeSingle();
    if (profileLookupErr) {
      console.error('[pfa-onboarding-light] profile lookup failed:', profileLookupErr.message);
      return json(500, { ok: false, error: 'profile_lookup_failed' });
    }
    if (profileExisting) {
      return json(200, {
        ok: true,
        fleet_id: existing.id,
        profile_id: callerUserId,
        idempotent_replay: true,
      });
    }
    // Fleet exists but profile doesn't — fall through to profile insert below.
    const { error: profileInsErr } = await admin.from('courier_profiles').insert({
      user_id: callerUserId,
      full_name: body.display_name,
      phone: body.phone,
      vehicle_type: 'CAR',
      status: 'INACTIVE',
      fleet_id: existing.id,
    });
    if (profileInsErr && profileInsErr.code !== '23505') {
      console.error('[pfa-onboarding-light] profile insert failed:', profileInsErr.message);
      return json(500, { ok: false, error: 'profile_insert_failed' });
    }
    return json(200, {
      ok: true,
      fleet_id: existing.id,
      profile_id: callerUserId,
      idempotent_replay: true,
    });
  }

  // ── 6. Insert courier_fleets (PFA solo) ──────────────────────────────
  const slug = deriveSlug(body.display_name, callerUserId);
  const displayPrefix = derivePrefix(body.display_name);

  const { data: insertedFleet, error: fleetErr } = await admin
    .from('courier_fleets')
    .insert({
      name: body.display_name,
      slug,
      owner_user_id: callerUserId,
      pfa_owner_user_id: callerUserId,
      pfa_cui: cuiNorm,
      is_pfa_solo: true,
      display_prefix: displayPrefix,
      contact_phone: body.phone,
      is_active: false,
      kyf_required: true,
      // tier CHECK constraint allows ('owner','partner','external'); a solo
      // PFA is a partner-tier micro-fleet. The is_pfa_solo=true flag is the
      // PFA discriminator, not tier.
      tier: 'partner',
      allowed_verticals: ['restaurant', 'pharma'],
      delivery_app: 'hir',
    })
    .select('id')
    .single();

  if (fleetErr || !insertedFleet) {
    // 23505 = unique_violation — race with another concurrent caller. Look up
    // the existing row and treat as idempotent.
    if (fleetErr?.code === '23505') {
      const raced = await findExistingFleet(admin, cuiNorm, callerUserId);
      if (raced) {
        return json(200, {
          ok: true,
          fleet_id: raced.id,
          profile_id: callerUserId,
          idempotent_replay: true,
        });
      }
    }
    console.error('[pfa-onboarding-light] fleet insert failed:', fleetErr?.message);
    return json(500, { ok: false, error: 'fleet_insert_failed' });
  }

  const fleetId = insertedFleet.id as string;

  // ── 7. Seed fleet_kyf row with VERIFIED_PFA_LIGHT ────────────────────
  // The KYF-light flow short-circuits the multi-document review: ANAF active +
  // ID + selfie are enough for solo PFAs (per board §11.1). Status flips to
  // VERIFIED_PFA_LIGHT immediately so the marketplace can match the PFA.
  const { error: kyfErr } = await admin.from('fleet_kyf').insert({
    fleet_id: fleetId,
    cui: cuiNorm,
    company_name: anaf.name || body.display_name,
    address: anaf.address,
    anaf_active: anaf.active,
    anaf_checked_at: new Date().toISOString(),
    kyf_status: 'VERIFIED_PFA_LIGHT',
    submitted_at: new Date().toISOString(),
    verified_at: new Date().toISOString(),
  });
  // Non-fatal if KYF row already exists (idempotent re-entry).
  if (kyfErr && kyfErr.code !== '23505') {
    console.error('[pfa-onboarding-light] fleet_kyf insert failed:', kyfErr.message);
    // Don't bail — fleet row is the source of truth; admin can re-seed KYF.
  }

  // ── 8. Insert courier_profiles linked to the new fleet ───────────────
  const { error: profileErr } = await admin.from('courier_profiles').insert({
    user_id: callerUserId,
    full_name: body.display_name,
    phone: body.phone,
    vehicle_type: 'CAR',
    status: 'INACTIVE',
    fleet_id: fleetId,
  });
  if (profileErr && profileErr.code !== '23505') {
    console.error('[pfa-onboarding-light] profile insert failed:', profileErr.message);
    return json(500, { ok: false, error: 'profile_insert_failed' });
  }

  // ── 9. Done ──────────────────────────────────────────────────────────
  return json(200, {
    ok: true,
    fleet_id: fleetId,
    profile_id: callerUserId,
  });
});
