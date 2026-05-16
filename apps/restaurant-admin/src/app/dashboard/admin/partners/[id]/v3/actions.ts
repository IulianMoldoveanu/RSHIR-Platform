'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { LADDER_TIERS, type WaveLabel, type LadderTier } from '@/lib/partner-v3-constants';

type ActionResult = { ok: true } | { ok: false; error: string };

// ─── Wave assignment ──────────────────────────────────────────────────────────

export async function assignWaveAction(
  partnerId: string,
  waveLabel: WaveLabel,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return { ok: false, error: 'Acces interzis.' };

  const admin = createAdminClient();

  const { error } = await admin
    .from('partners')
    .update({
      wave_label: waveLabel,
      wave_joined_at: new Date().toISOString(),
    } as Record<string, unknown>)
    .eq('id', partnerId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/dashboard/admin/partners/${partnerId}/v3`);
  return { ok: true };
}

// ─── KYC status update ───────────────────────────────────────────────────────

export type KycStatus = 'UNVERIFIED' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';

export async function updateKycStatusAction(
  partnerId: string,
  status: KycStatus,
  notes: string,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return { ok: false, error: 'Acces interzis.' };

  const admin = createAdminClient();

  const update: Record<string, unknown> = {
    kyc_status: status,
    kyc_notes: notes || null,
  };
  if (status === 'VERIFIED') {
    update.kyc_verified_at = new Date().toISOString();
  }

  const { error } = await admin
    .from('partners')
    .update(update)
    .eq('id', partnerId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/dashboard/admin/partners/${partnerId}/v3`);
  return { ok: true };
}

// ─── Sponsor assignment ───────────────────────────────────────────────────────

export async function assignSponsorAction(
  subPartnerId: string,
  sponsorPartnerId: string,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return { ok: false, error: 'Acces interzis.' };

  if (subPartnerId === sponsorPartnerId) {
    return { ok: false, error: 'Un partener nu poate fi sponsorul lui însuși.' };
  }

  const admin = createAdminClient();

  // Upsert: one sponsor per sub_partner_id (unique constraint)
  const { error } = await admin
    .from('partner_sponsors')
    .upsert(
      {
        sub_partner_id: subPartnerId,
        sponsor_partner_id: sponsorPartnerId,
        override_pct_y1: 10.0,
        override_pct_recurring: 6.0,
        sunset_at: new Date(
          Date.now() + 24 * 30 * 24 * 60 * 60 * 1000, // 24 months
        ).toISOString(),
      } as Record<string, unknown>,
      { onConflict: 'sub_partner_id' },
    );

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/dashboard/admin/partners/${subPartnerId}/v3`);
  return { ok: true };
}

// ─── Manual ladder award ──────────────────────────────────────────────────────

export async function awardLadderTierAction(
  partnerId: string,
  tier: LadderTier,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return { ok: false, error: 'Acces interzis.' };

  const admin = createAdminClient();
  const tierDef = LADDER_TIERS[tier];

  const { error } = await admin
    .from('ladder_milestones')
    .upsert(
      {
        partner_id: partnerId,
        tier_reached: tier,
        bonus_amount_cents: tierDef.cents,
        awarded_manually: true,
        awarded_at: new Date().toISOString(),
      } as Record<string, unknown>,
      { onConflict: 'partner_id,tier_reached', ignoreDuplicates: true },
    );

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/dashboard/admin/partners/${partnerId}/v3`);
  return { ok: true };
}
