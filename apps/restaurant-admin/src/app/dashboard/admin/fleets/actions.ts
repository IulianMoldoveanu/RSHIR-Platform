'use server';

// HIR Command Center — fleet control levers, native. The platform admin's
// switches over each fleet: display prefix, self-validation delegation, and the
// KYC/KYF operate-gates. Writes courier_fleets (same Supabase project as the
// courier PWA) via service_role, platform-admin gated. Each control saves
// independently (one-field update) so the UI stays simple.

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlatformAdmin } from '@/lib/auth/platform-admin';

export type FleetCtrlResult = { ok: true } | { ok: false; error: string };

export type FleetControls = {
  display_prefix?: string | null;
  can_validate_couriers?: boolean;
  kyc_required?: boolean;
  kyf_required?: boolean;
  is_active?: boolean;
};

type UpdateChain = {
  from: (t: string) => {
    update: (row: Record<string, unknown>) => {
      eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

export async function updateFleetControls(
  fleetId: string,
  controls: FleetControls,
): Promise<FleetCtrlResult> {
  const admin = await getPlatformAdmin();
  if (!admin) return { ok: false, error: 'Acces interzis: doar PLATFORM_ADMIN.' };
  if (!fleetId) return { ok: false, error: 'Flotă lipsă.' };

  const updates: Record<string, unknown> = {};
  if (controls.display_prefix !== undefined) {
    const p = (controls.display_prefix ?? '').trim();
    if (p.length > 8) return { ok: false, error: 'Prefixul are maxim 8 caractere.' };
    updates.display_prefix = p || null;
  }
  if (controls.can_validate_couriers !== undefined) updates.can_validate_couriers = controls.can_validate_couriers;
  if (controls.kyc_required !== undefined) updates.kyc_required = controls.kyc_required;
  if (controls.kyf_required !== undefined) updates.kyf_required = controls.kyf_required;
  if (controls.is_active !== undefined) updates.is_active = controls.is_active;
  if (Object.keys(updates).length === 0) return { ok: true };

  const sb = createAdminClient() as unknown as UpdateChain;
  const { error } = await sb.from('courier_fleets').update(updates).eq('id', fleetId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/admin/fleets');
  return { ok: true };
}
