// /dashboard/admin/partners/[id]/v3 — admin v3 controls for a single partner.
// Gate: HIR_PLATFORM_ADMIN_EMAILS (via requirePlatformAdmin).
// Server component — reads data, renders client sub-components for interactivity.

import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { WAVE_BONUSES, LADDER_TIERS, type WaveLabel, type LadderTier } from '@/lib/partner-v3-constants';
import { WavePanel } from './_components/wave-panel';
import { KycPanel } from './_components/kyc-panel';
import { SponsorPanel } from './_components/sponsor-panel';
import { LadderPanel } from './_components/ladder-panel';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

type PartnerV3 = {
  id: string;
  name: string;
  email: string;
  status: string;
  wave_label: string | null;
  wave_joined_at: string | null;
  iban: string | null;
  cnp_hash: string | null;
  cui: string | null;
  address: string | null;
  kyc_status: string | null;
  kyc_verified_at: string | null;
  kyc_notes: string | null;
};

type ActivePartner = { id: string; name: string; email: string };

type MilestoneRow = { tier_reached: string; awarded_at: string; bonus_amount_cents: number };

type SponsorRow = {
  sponsor_partner_id: string;
  override_pct_y1: number;
  override_pct_recurring: number;
  sunset_at: string | null;
};

type StatsRow = {
  total_restaurants: number;
  total_commission_paid_cents: number;
  total_ladder_bonus_cents: number;
  sub_reseller_count: number;
};

export default async function PartnerV3Page({ params }: Props) {
  // ── Auth gate ─────────────────────────────────────────────
  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    if (auth.status === 401) redirect('/login');
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Acces interzis: pagina este rezervată administratorilor HIR.
      </div>
    );
  }

  const { id: partnerId } = await params;
  const admin = createAdminClient();

  // ── Fetch partner ─────────────────────────────────────────
  const { data: rawPartner, error: pError } = await admin
    .from('partners')
    .select(
      'id, name, email, status, wave_label, wave_joined_at, iban, cnp_hash, cui, address, kyc_status, kyc_verified_at, kyc_notes',
    )
    .eq('id', partnerId)
    .single();

  if (pError || !rawPartner) notFound();

  const partner = rawPartner as unknown as PartnerV3;

  // ── Fetch all active partners (for sponsor dropdown, exclude self) ─
  const { data: rawAllPartners } = await admin
    .from('partners')
    .select('id, name, email')
    .eq('status', 'ACTIVE')
    .neq('id', partnerId)
    .order('name');

  const allActivePartners: ActivePartner[] = (rawAllPartners ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    email: p.email as string,
  }));

  // ── Fetch existing sponsor row ────────────────────────────
  const { data: rawSponsor } = await admin
    .from('partner_sponsors')
    .select('sponsor_partner_id, override_pct_y1, override_pct_recurring, sunset_at')
    .eq('sub_partner_id', partnerId)
    .maybeSingle();

  const existingSponsor: SponsorRow | null = rawSponsor
    ? {
        sponsor_partner_id: rawSponsor.sponsor_partner_id as string,
        override_pct_y1: Number(rawSponsor.override_pct_y1),
        override_pct_recurring: Number(rawSponsor.override_pct_recurring),
        sunset_at: rawSponsor.sunset_at as string | null,
      }
    : null;

  // ── Fetch ladder milestones ───────────────────────────────
  const { data: rawMilestones } = await admin
    .from('ladder_milestones')
    .select('tier_reached, awarded_at, bonus_amount_cents')
    .eq('partner_id', partnerId);

  const milestones: MilestoneRow[] = (rawMilestones ?? []).map((m) => ({
    tier_reached: m.tier_reached as string,
    awarded_at: m.awarded_at as string,
    bonus_amount_cents: Number(m.bonus_amount_cents),
  }));

  // ── Stats ─────────────────────────────────────────────────
  const { data: rawReferrals } = await admin
    .from('partner_referrals')
    .select('id')
    .eq('partner_id', partnerId)
    .is('ended_at', null);

  const { data: rawCommissions } = await admin
    .from('partner_commissions')
    .select('amount_cents')
    .eq('partner_id', partnerId)
    .eq('status', 'PAID');

  const { data: rawSubResellers } = await admin
    .from('partner_sponsors')
    .select('sub_partner_id')
    .eq('sponsor_partner_id', partnerId);

  const ladderBonusCents = milestones.reduce((sum, m) => sum + m.bonus_amount_cents, 0);
  const commissionPaidCents = (rawCommissions ?? []).reduce(
    (sum, c) => sum + Number(c.amount_cents ?? 0),
    0,
  );

  const stats: StatsRow = {
    total_restaurants: (rawReferrals ?? []).length,
    total_commission_paid_cents: commissionPaidCents,
    total_ladder_bonus_cents: ladderBonusCents,
    sub_reseller_count: (rawSubResellers ?? []).length,
  };

  // ── Wave slot usage ───────────────────────────────────────
  // Count partners per wave for the slot-cap display
  const wavesToCheck: WaveLabel[] = ['W0', 'W1', 'W2', 'W3'];
  const waveCountMap: Partial<Record<WaveLabel, number>> = {};
  for (const w of wavesToCheck) {
    const { count } = await admin
      .from('partners')
      .select('id', { count: 'exact', head: true })
      .eq('wave_label', w)
      .then((r) => ({ count: r.count ?? 0 }));
    waveCountMap[w] = count;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Link href="/dashboard/admin/partners" className="hover:underline">
            Parteneri
          </Link>
          <span>/</span>
          <span>{partner.name}</span>
          <span>/</span>
          <span className="font-medium text-zinc-700">v3 Controls</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{partner.name}</h1>
        <p className="text-sm text-zinc-500">
          {partner.email} &mdash; status:{' '}
          <span className="font-medium text-zinc-800">{partner.status}</span>
        </p>
      </header>

      {/* Stats panel */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Restaurante active', value: stats.total_restaurants },
          {
            label: 'Comisioane platite',
            value: (stats.total_commission_paid_cents / 100).toFixed(0) + ' RON',
          },
          {
            label: 'Bonusuri Ladder',
            value: (stats.total_ladder_bonus_cents / 100).toFixed(0) + ' RON',
          },
          { label: 'Sub-reselleri', value: stats.sub_reseller_count },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
          >
            <div className="text-2xl font-bold tabular-nums text-zinc-900">{s.value}</div>
            <div className="mt-1 text-xs text-zinc-500">{s.label}</div>
          </div>
        ))}
      </section>

      {/* Wave assignment */}
      <WavePanel
        partnerId={partnerId}
        currentWave={(partner.wave_label ?? 'OPEN') as WaveLabel}
        waveJoinedAt={partner.wave_joined_at}
        waveBonuses={WAVE_BONUSES}
        waveCountMap={waveCountMap}
      />

      {/* KYC review */}
      <KycPanel
        partnerId={partnerId}
        iban={partner.iban}
        cnpHash={partner.cnp_hash}
        cui={partner.cui}
        address={partner.address}
        currentStatus={(partner.kyc_status ?? 'UNVERIFIED') as 'UNVERIFIED' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED'}
        kycVerifiedAt={partner.kyc_verified_at}
        kycNotes={partner.kyc_notes}
      />

      {/* Sponsor assignment */}
      <SponsorPanel
        subPartnerId={partnerId}
        allActivePartners={allActivePartners}
        existingSponsor={existingSponsor}
      />

      {/* Manual ladder award */}
      <LadderPanel
        partnerId={partnerId}
        milestones={milestones}
        ladderTiers={LADDER_TIERS}
      />
    </div>
  );
}
