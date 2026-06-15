'use server';

// Server actions for /fleet/kyf — fleet manager uploads identity documents
// directly in the admin panel (Iulian directive 2026-06-15: NO redirect to
// courier app). 3 documents required + IBAN + reg.com number + CAEN code.
//
// Files go to private bucket `fleet-kyf` at path `<fleet_id>/<slot>.<ext>`.
// Bucket is private (public=false); we expose via signed URLs in the admin
// review surface (/dashboard/admin/verifications). Fleet managers see their
// own files via the same signed-URL mechanism.

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { lookupAnaf, normaliseCui } from '@/lib/anaf';

const BUCKET = 'fleet-kyf';
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB per bucket config

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

type Slot = 'act_constitutiv' | 'extras_cont' | 'certificat_inreg';

function isSlot(v: string): v is Slot {
  return v === 'act_constitutiv' || v === 'extras_cont' || v === 'certificat_inreg';
}

async function requireFleetForUser() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: fleet } = await admin
    .from('courier_fleets')
    .select('id, name')
    .eq('owner_user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!fleet?.id) throw new Error('No fleet for user');
  return { userId: user.id, fleetId: fleet.id as string, fleetName: fleet.name as string };
}

export async function uploadKyfDocumentAction(formData: FormData) {
  const slot = String(formData.get('slot') ?? '');
  if (!isSlot(slot)) return { ok: false, error: 'Slot invalid' };

  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'Fisier lipsa' };
  if (file.size === 0) return { ok: false, error: 'Fisier gol' };
  if (file.size > MAX_SIZE) return { ok: false, error: 'Fisier prea mare (max 10 MB)' };
  if (!ALLOWED_MIMES.has(file.type)) {
    return { ok: false, error: 'Format permis: PDF, JPG, PNG sau WEBP' };
  }

  const { fleetId } = await requireFleetForUser();

  // Storage path: <fleet_id>/<slot>.<ext>. Overwrite previous if any.
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf';
  const path = `${fleetId}/${slot}.${ext}`;

  const admin = createAdminClient();
  const arrayBuffer = await file.arrayBuffer();
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, new Uint8Array(arrayBuffer), {
      contentType: file.type,
      upsert: true,
    });
  if (upErr) {
    console.error('[fleet/kyf] upload error:', upErr.message);
    return { ok: false, error: 'Eroare la incarcare. Reincearca.' };
  }

  const column = `${slot}_url` as 'act_constitutiv_url' | 'extras_cont_url' | 'certificat_inreg_url';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updErr } = await (admin as any)
    .from('fleet_kyf')
    .update({ [column]: path, updated_at: new Date().toISOString() })
    .eq('fleet_id', fleetId);
  if (updErr) {
    console.error('[fleet/kyf] update error:', updErr.message);
    return { ok: false, error: 'Eroare la salvare in DB.' };
  }

  revalidatePath('/fleet');
  revalidatePath('/fleet/kyf');
  return { ok: true };
}

export async function saveKyfMetaAction(formData: FormData) {
  const reg_com = String(formData.get('reg_com') ?? '').trim();
  const caen_code = String(formData.get('caen_code') ?? '').trim();
  const iban = String(formData.get('iban') ?? '').trim().replace(/\s+/g, '').toUpperCase();
  const address = String(formData.get('address') ?? '').trim();
  const city_id = String(formData.get('city_id') ?? '').trim();

  // Loose validation — Iulian reviews everything anyway.
  if (reg_com && !/^J\d{2}\/\d{1,6}\/\d{4}$/i.test(reg_com)) {
    return { ok: false, error: 'Format Reg. Com. invalid (ex: J40/123/2020).' };
  }
  if (caen_code && !/^\d{4}$/.test(caen_code)) {
    return { ok: false, error: 'Cod CAEN trebuie sa fie 4 cifre.' };
  }
  if (iban && !/^RO\d{2}[A-Z0-9]{20,}$/.test(iban)) {
    return { ok: false, error: 'IBAN invalid (trebuie sa inceapa cu RO).' };
  }
  if (city_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(city_id)) {
    return { ok: false, error: 'Oras invalid.' };
  }

  const { fleetId } = await requireFleetForUser();
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('fleet_kyf')
    .update({
      reg_com: reg_com || null,
      caen_code: caen_code || null,
      iban: iban || null,
      address: address || null,
      updated_at: new Date().toISOString(),
    })
    .eq('fleet_id', fleetId);
  if (error) {
    console.error('[fleet/kyf] meta update error:', error.message);
    return { ok: false, error: 'Eroare la salvare.' };
  }
  // 2026-06-15 — also update courier_fleets.primary_city_id so dispatch can
  // match fleet↔tenant by city. Pre-existing fleets without a city use this
  // form to set it the first time they log in.
  if (city_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from('courier_fleets')
      .update({ primary_city_id: city_id })
      .eq('id', fleetId);
    revalidatePath('/fleet');
  }
  revalidatePath('/fleet/kyf');
  return { ok: true };
}

export async function submitKyfAction() {
  const { fleetId } = await requireFleetForUser();
  const admin = createAdminClient();

  // Require all 3 documents + IBAN before allowing submission.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: kyf } = await (admin as any)
    .from('fleet_kyf')
    .select('act_constitutiv_url, extras_cont_url, certificat_inreg_url, iban, reg_com, kyf_status')
    .eq('fleet_id', fleetId)
    .maybeSingle();

  if (!kyf) return { ok: false, error: 'Fisa KYF inexistenta — contacteaza-ne.' };
  const missing: string[] = [];
  if (!kyf.act_constitutiv_url) missing.push('Act constitutiv');
  if (!kyf.extras_cont_url) missing.push('Extras de cont');
  if (!kyf.certificat_inreg_url) missing.push('Certificat inregistrare');
  if (!kyf.iban) missing.push('IBAN');
  if (!kyf.reg_com) missing.push('Reg. Comertului');
  if (missing.length) {
    return { ok: false, error: `Lipsesc: ${missing.join(', ')}` };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('fleet_kyf')
    .update({
      kyf_status: 'PENDING', // signals: ready for Iulian review (was PENDING_DOCS prior to submit)
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('fleet_id', fleetId);
  if (error) return { ok: false, error: 'Eroare la trimitere.' };

  revalidatePath('/fleet');
  revalidatePath('/fleet/kyf');
  return { ok: true };
}

export async function anafSyncAction(formData: FormData) {
  // 2026-06-15 — Iulian directive: when fleet manager enters CUI on KYF page,
  // pull official data from ANAF and persist it to fleet_kyf (name, address,
  // reg_com, caen_code, vat_payer, anaf_active, anaf_checked_at). Returns
  // the snapshot so the form can prefill its inputs.
  const cuiRaw = String(formData.get('cui') ?? '').trim();
  const cui = normaliseCui(cuiRaw);
  if (!cui) return { ok: false as const, error: 'CUI invalid.' };

  const { fleetId } = await requireFleetForUser();
  const company = await lookupAnaf(cui);
  if (!company) {
    return {
      ok: false as const,
      error: 'ANAF nu a gasit firma cu acest CUI (sau API-ul nu raspunde). Verifica CUI-ul si reincearca.',
    };
  }
  if (!company.active) {
    return {
      ok: false as const,
      error: 'Firma figureaza ca inactiva/radiata in ANAF. Nu poate opera o flota HIR.',
    };
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('fleet_kyf')
    .update({
      cui: company.cui,
      company_name: company.name,
      address: company.address ?? null,
      reg_com: company.regCom ?? null,
      caen_code: company.caenCode ?? null,
      vat_payer: company.vatPayer,
      anaf_active: company.active,
      anaf_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('fleet_id', fleetId);
  if (error) {
    console.error('[fleet/kyf] anaf save error:', error.message);
    return { ok: false as const, error: 'Eroare la salvare datelor ANAF.' };
  }
  revalidatePath('/fleet/kyf');
  revalidatePath('/fleet');
  return {
    ok: true as const,
    company: {
      cui: company.cui,
      name: company.name,
      address: company.address,
      regCom: company.regCom,
      caenCode: company.caenCode,
      vatPayer: company.vatPayer,
      active: company.active,
    },
  };
}

export async function signedUrlAction(formData: FormData): Promise<{ url?: string; error?: string }> {
  const slot = String(formData.get('slot') ?? '');
  if (!isSlot(slot)) return { error: 'Slot invalid' };

  const { fleetId } = await requireFleetForUser();
  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: kyf } = await (admin as any)
    .from('fleet_kyf')
    .select(`${slot}_url`)
    .eq('fleet_id', fleetId)
    .maybeSingle();

  const path = (kyf as Record<string, string | null> | null)?.[`${slot}_url`];
  if (!path) return { error: 'Document neincarcat' };

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 10); // 10 minutes
  if (error || !data) return { error: 'Eroare la generare link' };
  return { url: data.signedUrl };
}
