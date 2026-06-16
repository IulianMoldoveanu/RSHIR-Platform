'use server';

// Casual vendor self-serve signup — server actions.
//
// Stream UI-2 — pairs with supabase/functions/casual-vendor-signup/index.ts.
//
// Two actions:
//   1. anafLookupAction(cui)       — server-side ANAF prefill so the wizard can
//                                    show "Confirmă datele firmei" with the
//                                    canonical name + address before submit.
//                                    Authenticated callers only (any logged-in
//                                    user is OK — no fleet gate, unlike the
//                                    /api/fleet/anaf-lookup endpoint).
//   2. submitCasualSignupAction(.) — forwards the user's JWT to the edge fn
//                                    `casual-vendor-signup`, which writes
//                                    tenants(CASUAL) + tenant_members(OWNER) +
//                                    tenant_subscriptions(trial, +30 days).
//
// Feature flag: HIR_FEATURE_CASUAL_VENDOR_ENABLED. Edge fn enforces 503 when
// off; the page also calls notFound() so the surface disappears entirely.

import { createServerClient } from '@/lib/supabase/server';
import { lookupAnaf, normaliseCui, type AnafCompany } from '@/lib/anaf';

export type SubscriptionTier = 'basic' | 'pro' | 'enterprise';

export type AnafLookupResult =
  | { ok: true; company: AnafCompany }
  | { ok: false; error: string };

export type CasualSignupInput = {
  cui: string;
  brandName: string;
  email: string;
  phone: string;
  subscriptionTier: SubscriptionTier;
};

export type CasualSignupResult =
  | { ok: true; tenantId: string; subscriptionId: string; idempotentReplay: boolean }
  | { ok: false; error: string };

const CUI_RE = /^(RO)?\d{2,10}$/i;
const VALID_TIERS: ReadonlyArray<SubscriptionTier> = ['basic', 'pro', 'enterprise'];

// ────────────────────────────────────────────────────────────
// 1. ANAF lookup — server-only, used by the wizard step 1.
// ────────────────────────────────────────────────────────────
export async function anafLookupAction(cuiRaw: string): Promise<AnafLookupResult> {
  // Any authenticated user can call this — the casual signup is open to anyone
  // who is logged in (the edge fn is the authoritative gate).
  const supa = await createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  if (!normaliseCui(cuiRaw)) return { ok: false, error: 'invalid_cui' };

  const company = await lookupAnaf(cuiRaw);
  if (!company) return { ok: false, error: 'not_found' };
  if (!company.active) return { ok: false, error: 'cif_inactive' };

  return { ok: true, company };
}

// ────────────────────────────────────────────────────────────
// 2. Submit — forwards JWT to casual-vendor-signup edge fn.
// ────────────────────────────────────────────────────────────
function describeEdgeError(code: string): string {
  switch (code) {
    case 'casual_vendor_feature_not_enabled':
      return 'Înregistrarea vendorilor ocazionali nu este activă momentan.';
    case 'missing_bearer':
    case 'invalid_token':
      return 'Sesiunea a expirat. Reautentifică-te și încearcă din nou.';
    case 'invalid_json':
    case 'invalid_input':
      return 'Datele formularului nu sunt valide.';
    case 'anaf_cif_not_found':
      return 'CUI-ul nu a fost găsit la ANAF.';
    case 'anaf_cif_inactive':
      return 'Firma figurează inactivă/radiată la ANAF.';
    case 'subscription_plan_missing':
      return 'Planul de abonament nu este disponibil. Contactează suportul.';
    case 'tenant_insert_failed':
    case 'tenant_member_insert_failed':
    case 'subscription_insert_failed':
      return 'Nu am putut crea contul. Reîncearcă peste câteva secunde.';
    default:
      return 'Eroare la înregistrare. Reîncearcă peste câteva secunde.';
  }
}

export async function submitCasualSignupAction(
  input: CasualSignupInput,
): Promise<CasualSignupResult> {
  // ── 1. Validate input shape (mirror the edge fn schema). ────────────
  if (!input.cui || !CUI_RE.test(input.cui.trim())) {
    return { ok: false, error: 'CUI invalid. Format: RO12345678 sau 12345678.' };
  }
  const brand = (input.brandName ?? '').trim();
  if (brand.length < 2 || brand.length > 100) {
    return { ok: false, error: 'Numele brandului trebuie să aibă 2-100 caractere.' };
  }
  const email = (input.email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: 'Email invalid.' };
  }
  const phone = (input.phone ?? '').trim();
  if (phone.length < 9 || phone.length > 30) {
    return { ok: false, error: 'Telefon invalid (9-30 caractere).' };
  }
  if (!VALID_TIERS.includes(input.subscriptionTier)) {
    return { ok: false, error: 'Plan de abonament invalid.' };
  }

  // ── 2. Resolve session + access token. ──────────────────────────────
  const supa = await createServerClient();
  const {
    data: { session },
  } = await supa.auth.getSession();
  if (!session?.user?.id || !session.access_token) {
    return { ok: false, error: 'Sesiune expirată. Te rugăm să te autentifici din nou.' };
  }

  // ── 3. Build edge function URL. ─────────────────────────────────────
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    return { ok: false, error: 'NEXT_PUBLIC_SUPABASE_URL nu este configurat.' };
  }
  const url = `${base.replace(/\/$/, '')}/functions/v1/casual-vendor-signup`;

  // ── 4. Call edge fn. ────────────────────────────────────────────────
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        cui: input.cui.trim(),
        brand_name: brand,
        email,
        phone,
        subscription_tier: input.subscriptionTier,
      }),
      cache: 'no-store',
    });
  } catch (e) {
    return {
      ok: false,
      error: `Edge function unreachable: ${e instanceof Error ? e.message : 'network_error'}`,
    };
  }

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    // Fall through.
  }

  if (!res.ok || !parsed || typeof parsed !== 'object') {
    const code =
      parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error: unknown }).error ?? 'unknown')
        : `http_${res.status}`;
    return { ok: false, error: describeEdgeError(code) };
  }

  const body = parsed as {
    ok?: boolean;
    tenant_id?: string;
    subscription_id?: string;
    idempotent_replay?: boolean;
  };
  if (!body.ok || !body.tenant_id || !body.subscription_id) {
    return { ok: false, error: 'Răspuns invalid de la server.' };
  }

  return {
    ok: true,
    tenantId: body.tenant_id,
    subscriptionId: body.subscription_id,
    idempotentReplay: body.idempotent_replay === true,
  };
}
