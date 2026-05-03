'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const KNOWN_CAPABILITIES = ['pharma', 'cash', 'alcohol'] as const;
type Capability = (typeof KNOWN_CAPABILITIES)[number];

function isCapability(v: string): v is Capability {
  return (KNOWN_CAPABILITIES as readonly string[]).includes(v);
}

/**
 * Toggles a single capability on the current courier's profile. Filters
 * unknown values defensively even though the DB-side trigger also rejects
 * them; this avoids a failed-action round-trip on a typo.
 *
 * Compliance note: capabilities are SELF-DECLARED here. Pharma certification
 * + alcohol age-gate verification will eventually move behind an admin-side
 * approval flow (out of scope for pilot — Iulian's couriers are vetted
 * directly today).
 */
export async function updateCapabilitiesAction(formData: FormData): Promise<void> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const next = (formData.getAll('capability') as string[])
    .filter(isCapability)
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort();

  const admin = createAdminClient();
  await admin
    .from('courier_profiles')
    .update({ capabilities: next })
    .eq('user_id', user.id);

  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard');
}
