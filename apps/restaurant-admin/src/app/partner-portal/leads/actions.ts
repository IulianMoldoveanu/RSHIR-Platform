'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { contactHash } from '@/lib/partner-v3-hash';

async function getCurrentPartnerId(): Promise<string> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from('partners')
    .select('id')
    .eq('user_id', user.id)
    .in('status', ['PENDING', 'ACTIVE'])
    .maybeSingle();

  if (!data) redirect('/login');
  return data.id as string;
}

export type RegisterLeadResult =
  | { ok: true }
  | { ok: false; error: string };

export async function registerLead(
  _prevState: RegisterLeadResult | null,
  formData: FormData,
): Promise<RegisterLeadResult> {
  const restaurantName = (formData.get('restaurant_name') as string | null)?.trim() ?? '';
  const phone = (formData.get('phone') as string | null)?.trim() || null;
  const email = (formData.get('email') as string | null)?.trim() || null;
  const cui = (formData.get('cui') as string | null)?.trim() || null;
  const expectedCloseAt = (formData.get('expected_close_at') as string | null)?.trim() || null;
  const pitchNotes = (formData.get('pitch_notes') as string | null)?.trim() || null;

  if (!restaurantName) {
    return { ok: false, error: 'Numele restaurantului este obligatoriu.' };
  }

  if (!phone && !email && !cui) {
    return {
      ok: false,
      error: 'Completează cel puțin un câmp de contact: telefon, email sau CUI.',
    };
  }

  const partnerId = await getCurrentPartnerId();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const hash = contactHash(phone, email, cui);

  // Check for existing active lock — give a friendly error with expiry date
  const { data: existing } = await admin
    .from('reseller_leads')
    .select('unlocks_at, partner_id')
    .eq('contact_hash', hash)
    .eq('status', 'active')
    .maybeSingle();

  if (existing) {
    const unlocksAt = new Date(existing.unlocks_at as string).toLocaleDateString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    if ((existing.partner_id as string) === partnerId) {
      return {
        ok: false,
        error: `Ai deja un lock activ pe acest restaurant până la ${unlocksAt}.`,
      };
    }
    return {
      ok: false,
      error: `Acest restaurant e deja claim-uit de alt reseller până la ${unlocksAt}.`,
    };
  }

  const { error: insertError } = await admin.from('reseller_leads').insert({
    partner_id: partnerId,
    restaurant_name: restaurantName,
    contact_hash: hash,
    phone,
    email,
    cui,
    expected_close_at: expectedCloseAt || null,
    pitch_notes: pitchNotes || null,
    locked_at: new Date().toISOString(),
    status: 'active',
    extended: false,
  });

  if (insertError) {
    // Catch race-condition unique constraint violation
    if ((insertError.code as string) === '23505') {
      return {
        ok: false,
        error: 'Acest restaurant a fost înregistrat de alt reseller în acest moment. Încearcă din nou.',
      };
    }
    console.error('[leads/actions] insert error:', insertError);
    return { ok: false, error: 'Eroare la înregistrare. Încearcă din nou.' };
  }

  revalidatePath('/partner-portal/leads');
  return { ok: true };
}

export type ExtendLeadResult = { ok: true } | { ok: false; error: string };

export async function extendLead(leadId: string): Promise<ExtendLeadResult> {
  const partnerId = await getCurrentPartnerId();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Verify ownership + not already extended
  const { data: lead } = await admin
    .from('reseller_leads')
    .select('id, partner_id, extended, status, unlocks_at')
    .eq('id', leadId)
    .maybeSingle();

  if (!lead || (lead.partner_id as string) !== partnerId) {
    return { ok: false, error: 'Lead inexistent sau nu ai acces.' };
  }
  if ((lead.status as string) !== 'active') {
    return { ok: false, error: 'Poți extinde doar lead-uri active.' };
  }
  if (lead.extended as boolean) {
    return { ok: false, error: 'Ai folosit deja extensia de 30 de zile pentru acest lead.' };
  }

  const currentUnlocksAt = new Date(lead.unlocks_at as string);
  const newUnlocksAt = new Date(currentUnlocksAt.getTime() + 30 * 24 * 60 * 60 * 1000);

  const { error } = await admin
    .from('reseller_leads')
    .update({
      extended: true,
      unlocks_at: newUnlocksAt.toISOString(),
    })
    .eq('id', leadId);

  if (error) {
    return { ok: false, error: 'Eroare la extindere.' };
  }

  revalidatePath('/partner-portal/leads');
  return { ok: true };
}
