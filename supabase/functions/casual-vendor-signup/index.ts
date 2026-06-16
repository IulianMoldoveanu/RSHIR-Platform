// Edge Function: casual-vendor-signup
//
// Stream EDGE-2 — Casual vendor self-serve signup + subscription enrollment.
// Pairs with migration 20260616_011_casual_vendor_subscriptions.sql.
//
// VISION LOCKED 2026-06-16 (board verdict §11.2):
//   Bursa Transporturilor pattern — vendors self-serve onto the open
//   marketplace via a light verification path (tenant_kind='CASUAL') with a
//   30-day trial subscription. Distinguished from the traditional FULL flow
//   (KYF + onboarding wizard).
//
// Contract: POST application/json
//   Authorization: Bearer <user JWT>  (caller becomes tenant_member OWNER)
//   Body:
//     {
//       cui:                string  // ANAF CIF, 2-10 digits, optional "RO"
//       brand_name:         string  // 2..100 chars
//       email:              email
//       phone:              string  // 9..30 chars
//       subscription_tier: 'basic' | 'pro' | 'enterprise'
//     }
//
// Response:
//   200 { ok: true, tenant_id, subscription_id, idempotent_replay?: true }
//   400 invalid input
//   401 unauthenticated
//   403 forbidden (reserved)
//   404 ANAF CIF not found
//   500 db error
//   503 feature off
//
// Idempotency: if the caller already owns a CASUAL tenant matching this CUI,
// return that one + the active subscription (the (tenant_id, status=trial)
// composite is the natural dedupe key).
//
// CLAUDE.md §5 anti-regression compliance:
//   - Zero `as any`. Strict typing throughout.
//   - Feature flag HIR_FEATURE_CASUAL_VENDOR_ENABLED gates the entire fn.
//   - ANAF validation is server-side ONLY (CIF must be active).
//   - tenant_members OWNER row inserted atomically with tenant — caller can
//     immediately query their own subscription via RLS.
//   - tenants.status uses the existing schema enum ('ONBOARDING' here = the
//     canonical "pending verification" state; flips to ACTIVE by admin or by
//     payment webhook).

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { z } from 'https://esm.sh/zod@3.23.8';

// ---------------------------------------------------------------------------
// ANAF public API client (duplicated; see pfa-onboarding-light/index.ts).
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
// Schema
// ---------------------------------------------------------------------------
const CUI_RE = /^(RO)?\d{2,10}$/i;
const SUBSCRIPTION_TIERS = ['basic', 'pro', 'enterprise'] as const;

const bodySchema = z.object({
  cui: z.string().trim().regex(CUI_RE, 'cui_invalid'),
  brand_name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(9).max(30),
  subscription_tier: z.enum(SUBSCRIPTION_TIERS),
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
function deriveSlug(brandName: string, userId: string): string {
  const base = brandName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'vendor';
  const suffix = userId.replace(/-/g, '').slice(0, 6);
  return `casual-${base}-${suffix}`;
}

function addDaysIso(days: number): string {
  // active_until is a DATE column (no time component).
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface ExistingTenant {
  id: string;
}
interface ExistingSubscription {
  id: string;
}

async function findExistingCasualTenant(
  admin: SupabaseClient,
  cuiNorm: string,
  ownerUserId: string,
): Promise<ExistingTenant | null> {
  // settings carries CUI for CASUAL tenants (no dedicated column). We look up
  // by the owner_user_id (via tenant_members) and CUI hint in settings JSON.
  const { data, error } = await admin
    .from('tenants')
    .select('id, settings')
    .eq('tenant_kind', 'CASUAL')
    .contains('settings', { casual_cui: cuiNorm });
  if (error) {
    console.error('[casual-vendor-signup] tenant lookup failed:', error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  // Filter to tenants where the caller is OWNER.
  const tenantIds = data.map((row) => row.id as string);
  const { data: membership, error: memberErr } = await admin
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', ownerUserId)
    .eq('role', 'OWNER')
    .in('tenant_id', tenantIds)
    .limit(1)
    .maybeSingle();
  if (memberErr) {
    console.error('[casual-vendor-signup] membership filter failed:', memberErr.message);
    return null;
  }
  if (!membership) return null;
  return { id: membership.tenant_id as string };
}

async function findActiveSubscription(
  admin: SupabaseClient,
  tenantId: string,
): Promise<ExistingSubscription | null> {
  const { data, error } = await admin
    .from('tenant_subscriptions')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('status', ['active', 'trial'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[casual-vendor-signup] subscription lookup failed:', error.message);
    return null;
  }
  return (data as ExistingSubscription | null) ?? null;
}

interface PlanRow {
  id: string;
}

async function resolvePlanId(admin: SupabaseClient, tierCode: string): Promise<string | null> {
  const { data, error } = await admin
    .from('subscription_plans')
    .select('id')
    .eq('tier_code', tierCode)
    .eq('active', true)
    .maybeSingle();
  if (error) {
    console.error('[casual-vendor-signup] plan lookup failed:', error.message);
    return null;
  }
  return ((data as PlanRow | null)?.id) ?? null;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (Deno.env.get('HIR_FEATURE_CASUAL_VENDOR_ENABLED') !== 'true') {
    return json(503, { ok: false, error: 'casual_vendor_feature_not_enabled' });
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

  // ── 3. ANAF check — server-side ONLY ─────────────────────────────────
  const cuiNorm = normaliseCui(body.cui);
  const anaf = await lookupAnaf(cuiNorm);
  if (!anaf) return json(404, { ok: false, error: 'anaf_cif_not_found' });
  if (!anaf.active) {
    return json(400, { ok: false, error: 'anaf_cif_inactive' });
  }

  // ── 4. Resolve plan_id ───────────────────────────────────────────────
  const planId = await resolvePlanId(admin, body.subscription_tier);
  if (!planId) return json(500, { ok: false, error: 'subscription_plan_missing' });

  // ── 5. Idempotency: existing CASUAL tenant for (caller, CUI)? ────────
  const existingTenant = await findExistingCasualTenant(admin, cuiNorm, callerUserId);
  if (existingTenant) {
    const existingSub = await findActiveSubscription(admin, existingTenant.id);
    if (existingSub) {
      return json(200, {
        ok: true,
        tenant_id: existingTenant.id,
        subscription_id: existingSub.id,
        idempotent_replay: true,
      });
    }
    // Tenant exists, subscription missing — finish the job.
    const { data: subInserted, error: subErr } = await admin
      .from('tenant_subscriptions')
      .insert({
        tenant_id: existingTenant.id,
        plan_id: planId,
        status: 'trial',
        active_until: addDaysIso(30),
      })
      .select('id')
      .single();
    if (subErr || !subInserted) {
      console.error('[casual-vendor-signup] subscription insert failed:', subErr?.message);
      return json(500, { ok: false, error: 'subscription_insert_failed' });
    }
    return json(200, {
      ok: true,
      tenant_id: existingTenant.id,
      subscription_id: subInserted.id as string,
      idempotent_replay: true,
    });
  }

  // ── 6. Insert tenants (CASUAL) ───────────────────────────────────────
  const slug = deriveSlug(body.brand_name, callerUserId);
  const { data: insertedTenant, error: tenantErr } = await admin
    .from('tenants')
    .insert({
      slug,
      name: body.brand_name,
      tenant_kind: 'CASUAL',
      // tenants.status check allows ONBOARDING/ACTIVE/SUSPENDED. ONBOARDING
      // is the canonical "pending verification" state for self-serve signups.
      status: 'ONBOARDING',
      settings: {
        casual_cui: cuiNorm,
        casual_email: body.email,
        casual_phone: body.phone,
        casual_anaf_name: anaf.name,
        casual_anaf_address: anaf.address,
        casual_anaf_checked_at: new Date().toISOString(),
      },
    })
    .select('id')
    .single();

  if (tenantErr || !insertedTenant) {
    console.error('[casual-vendor-signup] tenant insert failed:', tenantErr?.message);
    return json(500, { ok: false, error: 'tenant_insert_failed' });
  }
  const tenantId = insertedTenant.id as string;

  // ── 7. tenant_members OWNER row for the caller ───────────────────────
  const { error: memberErr } = await admin.from('tenant_members').insert({
    tenant_id: tenantId,
    user_id: callerUserId,
    role: 'OWNER',
  });
  if (memberErr && memberErr.code !== '23505') {
    console.error('[casual-vendor-signup] tenant_members insert failed:', memberErr.message);
    return json(500, { ok: false, error: 'tenant_member_insert_failed' });
  }

  // ── 8. tenant_subscriptions row (trial, +30 days) ────────────────────
  const { data: subInserted, error: subErr } = await admin
    .from('tenant_subscriptions')
    .insert({
      tenant_id: tenantId,
      plan_id: planId,
      status: 'trial',
      active_until: addDaysIso(30),
    })
    .select('id')
    .single();
  if (subErr || !subInserted) {
    console.error('[casual-vendor-signup] subscription insert failed:', subErr?.message);
    return json(500, { ok: false, error: 'subscription_insert_failed' });
  }

  // ── 9. Done ──────────────────────────────────────────────────────────
  return json(200, {
    ok: true,
    tenant_id: tenantId,
    subscription_id: subInserted.id as string,
  });
});
