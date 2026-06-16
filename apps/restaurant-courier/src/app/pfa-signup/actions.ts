'use server';

// Server actions for /pfa-signup — Solo PFA onboarding wizard.
//
// Two concerns:
//   1) `lookupAnafPfaAction` — let the user verify the CUI before uploading
//      docs, so the wizard can show the official ANAF name + active state
//      inline (faster signal than waiting for the edge fn at the end).
//   2) `submitPfaOnboardingAction` — forwards the wizard payload to the
//      edge fn `pfa-onboarding-light` with the caller's JWT. The edge fn
//      is the source of truth (re-runs ANAF, owns the fleet/profile
//      insert, idempotent on pfa_cui+owner) — we do NOT re-implement it
//      server-side here.
//
// We deliberately do not touch courier_fleets / fleet_kyf directly from
// this action: the edge fn already handles the multi-table write atomically
// and is the contract documented in supabase/functions/pfa-onboarding-light.

import { createServerClient } from '@/lib/supabase/server';
import { lookupAnaf, type AnafCompany } from '@/lib/anaf';

const FEATURE_FLAG = 'NEXT_PUBLIC_HIR_FEATURE_SOLO_PFA_ENABLED';
const CUI_RE = /^(RO)?\d{2,10}$/i;

export type PfaAnafLookupResult =
  | { ok: true; company: AnafCompany }
  | { ok: false; error: string };

/**
 * ANAF CUI lookup gated on an authenticated session (so anonymous traffic
 * can't use us as an ANAF proxy). Returns a friendly RO error on
 * not-found / network failure — the wizard still lets the user proceed
 * (the edge fn re-validates at submit time).
 */
export async function lookupAnafPfaAction(
  cuiRaw: string,
): Promise<PfaAnafLookupResult> {
  if (process.env[FEATURE_FLAG] !== 'true') {
    return { ok: false, error: 'Înregistrarea PFA nu este activă momentan.' };
  }
  if (!CUI_RE.test(cuiRaw.trim())) {
    return { ok: false, error: 'CUI invalid. Format: RO12345678 sau 12345678.' };
  }

  // Auth gate — any logged-in user can call (we don't need fleet manager
  // context here; the PFA is signing up).
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesiune expirată. Reconectează-te.' };

  const company = await lookupAnaf(cuiRaw);
  if (!company || !company.name) {
    return {
      ok: false,
      error:
        'CUI negăsit la ANAF. Verifică numărul — sau încearcă din nou peste un minut.',
    };
  }
  if (!company.active) {
    return {
      ok: false,
      error: 'PFA-ul este radiat sau inactiv la ANAF. Nu te putem înrola.',
    };
  }
  return { ok: true, company };
}

export type PfaSubmitInput = {
  cui: string;
  displayName: string;
  idDocPath: string;
  selfiePath: string;
  email: string;
  phone: string;
};

export type PfaSubmitResult =
  | { ok: true; fleetId: string; profileId: string; idempotentReplay?: boolean }
  | { ok: false; error: string };

/**
 * Forward the wizard payload to the edge fn `pfa-onboarding-light`. The
 * edge fn:
 *   - re-validates CUI vs ANAF (server-side only)
 *   - creates courier_fleets (is_pfa_solo=true) + fleet_kyf
 *     (kyf_status='VERIFIED_PFA_LIGHT') + courier_profiles atomically
 *   - is idempotent on (pfa_cui, owner_user_id)
 *
 * We forward the caller's JWT so the edge fn's owner_user_id mismatch
 * check (defense-in-depth) works.
 */
export async function submitPfaOnboardingAction(
  input: PfaSubmitInput,
): Promise<PfaSubmitResult> {
  if (process.env[FEATURE_FLAG] !== 'true') {
    return { ok: false, error: 'Înregistrarea PFA nu este activă momentan.' };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return { ok: false, error: 'Configurare Supabase lipsă.' };
  }

  const supabase = await createServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  const ownerUserId = session?.user.id;
  if (!accessToken || !ownerUserId) {
    return { ok: false, error: 'Sesiune expirată. Reconectează-te.' };
  }

  // Light client-side checks before the network call. The edge fn
  // re-validates with zod — this is just a friendlier first-pass.
  const cui = input.cui.trim();
  if (!CUI_RE.test(cui)) {
    return { ok: false, error: 'CUI invalid. Format: RO12345678 sau 12345678.' };
  }
  if (input.displayName.trim().length < 2) {
    return { ok: false, error: 'Numele PFA este obligatoriu (minim 2 caractere).' };
  }
  if (!input.idDocPath || !input.selfiePath) {
    return { ok: false, error: 'Încarcă atât actul de identitate, cât și selfie-ul.' };
  }
  if (input.phone.replace(/\D/g, '').length < 9) {
    return { ok: false, error: 'Telefon invalid (minim 9 cifre).' };
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/pfa-onboarding-light`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        pfa_cui: cui,
        owner_user_id: ownerUserId,
        display_name: input.displayName.trim(),
        id_doc_url: input.idDocPath,
        selfie_url: input.selfiePath,
        email: input.email.trim().toLowerCase(),
        phone: input.phone.trim(),
      }),
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Trimiterea a eșuat. Încearcă din nou.',
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, error: 'Răspuns invalid de la server.' };
  }

  const body = (payload ?? {}) as {
    ok?: boolean;
    error?: string;
    fleet_id?: string;
    profile_id?: string;
    idempotent_replay?: boolean;
  };

  if (!response.ok || body.ok !== true || !body.fleet_id || !body.profile_id) {
    return {
      ok: false,
      error: friendlyEdgeError(body.error, response.status),
    };
  }
  return {
    ok: true,
    fleetId: body.fleet_id,
    profileId: body.profile_id,
    idempotentReplay: body.idempotent_replay,
  };
}

/** Map edge-fn error codes → RO copy. Falls back to a generic message. */
function friendlyEdgeError(code: string | undefined, status: number): string {
  switch (code) {
    case 'solo_pfa_feature_not_enabled':
      return 'Înregistrarea PFA nu este activă momentan.';
    case 'anaf_cui_not_found':
      return 'CUI negăsit la ANAF. Verifică numărul.';
    case 'anaf_cui_inactive':
      return 'PFA-ul este radiat sau inactiv la ANAF.';
    case 'invalid_input':
      return 'Date invalide. Verifică formularul.';
    case 'invalid_token':
    case 'missing_bearer':
      return 'Sesiune expirată. Reconectează-te.';
    case 'owner_user_id_mismatch':
      return 'Identitatea contului nu corespunde. Reconectează-te.';
    case 'fleet_insert_failed':
    case 'profile_insert_failed':
    case 'profile_lookup_failed':
      return 'Eroare de server. Încearcă din nou în câteva momente.';
    default:
      return `Înregistrarea a eșuat (HTTP ${status}). Încearcă din nou.`;
  }
}
