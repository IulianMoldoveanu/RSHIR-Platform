'use server';

import { createServerClient } from '@/lib/supabase/server';

export type KycSubmitResult = { ok: true } | { ok: false; error: string };

/**
 * Submit / re-submit courier KYC. Calls the SECURITY DEFINER RPC
 * submit_courier_kyc as the authenticated courier (auth.uid() drives the row).
 * The RPC forces status=PENDING and takes fleet_id from courier_profiles, so a
 * courier can never self-verify or spoof a fleet. Doc fields are STORAGE PATHS
 * in the private courier-kyc bucket (not public URLs).
 */
export async function submitKycAction(input: {
  legalName: string;
  cui: string | null;
  idDocPath: string | null;
  selfiePath: string | null;
  deviceFingerprint: string | null;
}): Promise<KycSubmitResult> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not_authenticated' };

  const legalName = input.legalName.trim();
  if (legalName.length < 2) return { ok: false, error: 'invalid_name' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('submit_courier_kyc', {
    p_legal_name: legalName,
    p_cui: input.cui?.trim() || null,
    p_id_doc_url: input.idDocPath || null,
    p_selfie_url: input.selfiePath || null,
    p_device_fingerprint: input.deviceFingerprint || null,
  });

  if (error) {
    console.error('[kyc] submit_courier_kyc failed', error.message);
    return { ok: false, error: 'db_error' };
  }
  const result = (data ?? {}) as { ok?: boolean; reason?: string };
  if (result.ok) return { ok: true };
  return { ok: false, error: result.reason ?? 'unknown' };
}
