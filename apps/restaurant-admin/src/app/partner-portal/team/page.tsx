// /partner-portal/team — sub-resellers + invite link
//
// Server component. Auth already enforced by layout.tsx.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function centsToEur(cents: number): string {
  return (cents / 100).toLocaleString('ro-RO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

type SubRow = {
  id: string;
  name: string;
  status: string;
  kyc_status: string | null;
  sunset_at: string | null;
  referral_count: number;
  override_paid_cents: number;
};

export default async function TeamPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Current partner row
  const { data: rawPartner } = await admin
    .from('partners')
    .select('id, code')
    .eq('user_id', user.id)
    .in('status', ['PENDING', 'ACTIVE'])
    .maybeSingle();

  if (!rawPartner) redirect('/login');

  const partnerId = rawPartner.id as string;
  const partnerCode = (rawPartner.code as string | null) ?? null;

  // Sub-resellers: partner_sponsors rows where sponsor_partner_id = this partner
  const { data: rawSponsors } = await admin
    .from('partner_sponsors')
    .select(
      'sub_partner_id, sunset_at, partners:sub_partner_id(id, name, status, kyc_status)',
    )
    .eq('sponsor_partner_id', partnerId);

  const subIds: string[] = ((rawSponsors ?? []) as Array<{
    sub_partner_id: string;
    sunset_at: string | null;
    partners: { id: string; name: string; status: string; kyc_status: string | null } | null;
  }>).map((s) => s.sub_partner_id);

  // Referral counts per sub
  const referralCountMap = new Map<string, number>();
  if (subIds.length > 0) {
    const { data: rawCounts } = await admin
      .from('partner_referrals')
      .select('partner_id')
      .in('partner_id', subIds)
      .is('ended_at', null);

    for (const row of (rawCounts ?? []) as Array<{ partner_id: string }>) {
      referralCountMap.set(
        row.partner_id,
        (referralCountMap.get(row.partner_id) ?? 0) + 1,
      );
    }
  }

  // Override commissions paid per sub
  const overridePaidMap = new Map<string, number>();
  if (subIds.length > 0) {
    const { data: rawOverrides } = await admin
      .from('partner_commissions')
      .select('source_partner_id, amount_cents')
      .eq('partner_id', partnerId)
      .eq('commission_type', 'OVERRIDE')
      .in('source_partner_id', subIds)
      .eq('status', 'PAID');

    for (const row of (rawOverrides ?? []) as Array<{
      source_partner_id: string;
      amount_cents: number;
    }>) {
      overridePaidMap.set(
        row.source_partner_id,
        (overridePaidMap.get(row.source_partner_id) ?? 0) + Number(row.amount_cents),
      );
    }
  }

  const subs: SubRow[] = ((rawSponsors ?? []) as Array<{
    sub_partner_id: string;
    sunset_at: string | null;
    partners: { id: string; name: string; status: string; kyc_status: string | null } | null;
  }>).map((s) => ({
    id: s.sub_partner_id,
    name: s.partners?.name ?? '—',
    status: s.partners?.status ?? '—',
    kyc_status: s.partners?.kyc_status ?? null,
    sunset_at: s.sunset_at,
    referral_count: referralCountMap.get(s.sub_partner_id) ?? 0,
    override_paid_cents: overridePaidMap.get(s.sub_partner_id) ?? 0,
  }));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.hirforyou.ro';
  const inviteCode = partnerCode ?? partnerId.slice(0, 8);
  const inviteLink = `${appUrl}/parteneriat?sponsor=${inviteCode}`;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Echipa ta</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Sub-reselleri aduși de tine — primești 10% Y1 + €200 bonus când ajung la 5 restaurante.
        </p>
      </header>

      {/* Invite link */}
      <section className="rounded-lg border border-purple-200 bg-purple-50 p-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-purple-700">
          Linkul tău de invitație reseller
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            readOnly
            value={inviteLink}
            className="flex-1 rounded-md border border-purple-200 bg-white px-3 py-2.5 font-mono text-sm text-zinc-900 focus:border-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-600"
            aria-label="Link invitație sub-reseller"
          />
        </div>
        <p className="mt-2 text-xs text-purple-700">
          Trimite acest link prietenilor care vor să devină reselleri sub echipa ta. Vei câștiga
          10% din comisionul lor în primul an + bonus €200 per sub-reseller care ajunge la 5
          restaurante.
        </p>
      </section>

      {/* Sub-reseller table */}
      <section aria-label="Sub-reselleri">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Sub-reselleri activi</h2>
        {subs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
            <p className="text-sm text-zinc-500">
              Nu ai sub-reselleri încă. Trimite linkul de mai sus prietenilor care vor să facă
              parte din echipa ta — primești 10% Y1 + €200 bonus când ajung la 5 restaurante.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                  <th className="px-4 py-2 text-left font-medium">Nume</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Restaurante aduse</th>
                  <th className="px-4 py-2 text-right font-medium">Override primit (€)</th>
                  <th className="px-4 py-2 text-left font-medium">Expiră</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {subs.map((s) => (
                  <tr key={s.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 font-medium text-zinc-900">{s.name}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} kycStatus={s.kyc_status} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-700">
                      {s.referral_count}
                      {s.referral_count >= 5 ? (
                        <span
                          title="A atins Bronze — ai primit €200 bonus"
                          className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                        >
                          Bronze
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-700">
                      €{centsToEur(s.override_paid_cents)}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {s.sunset_at ? fmtDate(s.sunset_at) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({
  status,
  kycStatus,
}: {
  status: string;
  kycStatus: string | null;
}) {
  const cls =
    status === 'ACTIVE'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'PENDING'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-zinc-100 text-zinc-500';
  const label = status === 'ACTIVE' ? 'ACTIV' : status === 'PENDING' ? 'ÎN AȘTEPTARE' : status;
  const kycLabel =
    kycStatus === 'VERIFIED'
      ? null
      : kycStatus === 'PENDING_REVIEW'
        ? 'KYC review'
        : kycStatus === 'REJECTED'
          ? 'KYC respins'
          : 'KYC neverificat';
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
      >
        {label}
      </span>
      {kycLabel ? (
        <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500">
          {kycLabel}
        </span>
      ) : null}
    </span>
  );
}
