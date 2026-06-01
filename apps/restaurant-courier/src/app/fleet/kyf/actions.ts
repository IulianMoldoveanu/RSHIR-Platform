'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getFleetManagerContext } from '@/lib/fleet-manager';
import { lookupAnaf, type AnafCompany } from '@/lib/anaf';

export type AnafLookupResult =
  | { ok: true; company: AnafCompany }
  | { ok: false; error: string };

/**
 * Look up a company by CUI via the free ANAF public API. Gated on the fleet
 * manager so anonymous traffic can't use us as an ANAF proxy. Returns a
 * friendly error on not-found / ANAF down — the owner can still submit and
 * upload documents for manual review.
 */
export async function lookupAnafAction(cuiRaw: string): Promise<AnafLookupResult> {
  const ctx = await getFleetManagerContext();
  if (!ctx) return { ok: false, error: 'Acces interzis.' };

  const company = await lookupAnaf(cuiRaw);
  if (!company || !company.name) {
    return {
      ok: false,
      error: 'CUI negăsit la ANAF. Verifică numărul — poți completa și manual, documentele rămân obligatorii.',
    };
  }
  return { ok: true, company };
}

export type KyfSubmitInput = {
  cui: string;
  companyName: string | null;
  regCom: string | null;
  caenCode: string | null;
  address: string | null;
  vatPayer: boolean | null;
  anafActive: boolean | null;
  iban: string | null;
  actConstitutivPath: string | null;
  extrasContPath: string | null;
  certificatInregPath: string | null;
};

export type KyfSubmitResult = { ok: true } | { ok: false; error: string };

/**
 * Submit / re-submit fleet KYF. Calls the SECURITY DEFINER RPC submit_fleet_kyf
 * as the authenticated owner (auth.uid() drives the owner check inside the RPC).
 * fleet_id is taken from the manager context (derived server-side from the
 * session), never from client input — a fleet owner can only submit KYF for
 * their own fleet. Doc fields are STORAGE PATHS in the private fleet-kyf bucket.
 */
export async function submitKyfAction(input: KyfSubmitInput): Promise<KyfSubmitResult> {
  const ctx = await getFleetManagerContext();
  if (!ctx) return { ok: false, error: 'Acces interzis.' };

  const cui = input.cui.trim();
  if (!cui) return { ok: false, error: 'CUI-ul este obligatoriu.' };
  if (!input.actConstitutivPath || !input.extrasContPath || !input.certificatInregPath) {
    return { ok: false, error: 'Încarcă toate cele 3 documente.' };
  }

  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('submit_fleet_kyf', {
    p_fleet_id: ctx.fleetId,
    p_cui: cui,
    p_company_name: input.companyName,
    p_reg_com: input.regCom,
    p_caen_code: input.caenCode,
    p_address: input.address,
    p_vat_payer: input.vatPayer,
    p_anaf_active: input.anafActive,
    p_iban: input.iban?.trim() || null,
    p_act_constitutiv_url: input.actConstitutivPath,
    p_extras_cont_url: input.extrasContPath,
    p_certificat_inreg_url: input.certificatInregPath,
  });

  if (error) {
    console.error('[kyf] submit_fleet_kyf failed', error.message);
    return { ok: false, error: 'Eroare de server. Încearcă din nou.' };
  }
  const result = (data ?? {}) as { ok?: boolean; reason?: string };
  if (result.ok) return { ok: true };
  switch (result.reason) {
    case 'not_fleet_owner':
      return { ok: false, error: 'Doar proprietarul flotei poate trimite KYF.' };
    case 'fleet_not_found':
      return { ok: false, error: 'Flota nu a fost găsită.' };
    case 'not_authenticated':
      return { ok: false, error: 'Sesiunea a expirat. Autentifică-te din nou.' };
    default:
      return { ok: false, error: 'Nu am putut trimite datele.' };
  }
}
