// /dashboard/champion — Restaurant-Champion viral loop (v3 Loop 3)
//
// Spec: apps/restaurant-admin/src/lib/partner-v3-spec.md §UI contracts
// Strategy: RSHIR-RESELLER-PROGRAM-V3-SNOWBALL-STRATEGY.md §3
//
// Server component — auth-gated via layout.tsx getActiveTenant().
// Lazy-generates champion_code on first visit via admin client.
// Lists champion_referrals rows for the current tenant with reward status.

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';
import { championCode } from '@/lib/partner-v3-hash';
import { V3_CONSTANTS } from '@/lib/partner-v3-constants';
import { CopyLinkButton } from './_components/copy-link-button';
import { WhatsAppButton } from './_components/whatsapp-button';

export const dynamic = 'force-dynamic';

const REWARD_STATUS_LABEL: Record<string, string> = {
  pending: 'Înregistrat',
  trial_active: 'În perioadă de probă',
  verified: 'Verificat — recompensă aprobată',
  paid: 'Plătit',
  void: 'Anulat',
};

const REWARD_STATUS_TONE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  trial_active: 'bg-blue-50 text-blue-800 ring-blue-200',
  verified: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  paid: 'bg-emerald-100 text-emerald-900 ring-emerald-300',
  void: 'bg-zinc-100 text-zinc-600 ring-zinc-200',
};

type ChampionReferralRow = {
  id: string;
  referred_tenant_id: string;
  referred_at: string;
  reward_status: string;
  free_months_credited: number;
  cash_bonus_cents: number;
  tenants: { name: string } | null;
};

export default async function ChampionPage() {
  let active: Awaited<ReturnType<typeof getActiveTenant>>;
  try {
    active = await getActiveTenant();
  } catch {
    redirect('/login');
  }

  const { tenant } = active;
  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbAny = admin as any;

  // Fetch tenant row to check champion_code.
  const { data: tenantRow, error: tenantErr } = await dbAny
    .from('tenants')
    .select('champion_code')
    .eq('id', tenant.id)
    .maybeSingle();

  if (tenantErr) {
    console.error('[champion] tenant fetch failed', tenantErr.message);
  }

  let code: string = tenantRow?.champion_code as string | null ?? '';

  // Lazy-generate champion_code if not yet set.
  if (!code) {
    code = championCode(tenant.id);
    const { error: updateErr } = await dbAny
      .from('tenants')
      .update({ champion_code: code })
      .eq('id', tenant.id);
    if (updateErr) {
      console.error('[champion] champion_code update failed', updateErr.message);
      // Non-fatal: still show the code even if DB write failed.
    }
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    `https://app.${process.env.NEXT_PUBLIC_PRIMARY_DOMAIN ?? 'hirforyou.ro'}`;
  const shareUrl = `${appUrl}/signup?champion=${code}`;
  const cashEur = Math.floor(V3_CONSTANTS.CHAMPION_CASH_CENTS / 100);

  // Fetch referrals made by this tenant.
  const { data: referrals, error: referralsErr } = await dbAny
    .from('champion_referrals')
    .select(
      'id, referred_tenant_id, referred_at, reward_status, free_months_credited, cash_bonus_cents, tenants(name)',
    )
    .eq('referrer_tenant_id', tenant.id)
    .order('referred_at', { ascending: false });

  if (referralsErr) {
    console.error('[champion] referrals fetch failed', referralsErr.message);
  }

  const rows: ChampionReferralRow[] = (referrals ?? []) as ChampionReferralRow[];

  const pendingCount = rows.filter((r) =>
    ['pending', 'trial_active'].includes(r.reward_status),
  ).length;
  const totalEarnedCents = rows
    .filter((r) => r.reward_status === 'paid')
    .reduce((sum, r) => sum + (r.cash_bonus_cents ?? 0), 0);

  const whatsappText = encodeURIComponent(
    `Salut! Am folosit HIR pentru comenzile online ale restaurantului meu și e super. ` +
      `Dacă te înregistrezi prin link-ul meu, primești 60 de zile gratuit (dublu față de normal): ` +
      shareUrl,
  );
  const emailSubject = encodeURIComponent('Încearcă HIR — 60 de zile gratuit');
  const emailBody = encodeURIComponent(
    `Bună,\n\nFolosesc HIR pentru comenzile online ale restaurantului meu și îl recomand cu mare drag.\n\n` +
      `Dacă te înregistrezi prin link-ul de mai jos, primești 60 de zile de probă gratuit (față de 30 pentru cei direcți):\n\n` +
      `${shareUrl}\n\nSper să fie de folos!`,
  );

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Recomandă un restaurant — câștigi 1 lună gratuit + €{cashEur} cash
        </h1>
        <p className="text-sm text-zinc-600">
          Fiecare restaurant recomandat care completează prima lună plătită îți aduce{' '}
          <span className="font-medium text-zinc-900">1 lună gratuită</span> și{' '}
          <span className="font-medium text-zinc-900">€{cashEur} cash</span>. Prietenul tău primește{' '}
          <span className="font-medium text-zinc-900">60 de zile gratuit</span> (vs 30 pentru cei direcți).
        </p>
      </header>

      {/* Code + share */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Codul tău de recomandare
          </span>
          <span className="text-3xl font-bold tracking-widest text-zinc-900 font-mono">
            {code}
          </span>
          <span className="text-xs text-zinc-500 break-all">{shareUrl}</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <CopyLinkButton url={shareUrl} />

          <a
            href={`https://wa.me/?text=${whatsappText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            aria-label="Trimite prin WhatsApp"
          >
            <WhatsAppButton />
            WhatsApp
          </a>

          <a
            href={`mailto:?subject=${emailSubject}&body=${emailBody}`}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-700"
            aria-label="Trimite prin email"
          >
            Email
          </a>
        </div>
      </section>

      {/* Stats */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-2xl font-bold text-zinc-900">{rows.length}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Restaurante recomandate</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Recompense în așteptare</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-2xl font-bold text-emerald-700">
              €{Math.floor(totalEarnedCents / 100)}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">Total cash câștigat</p>
          </div>
        </div>
      )}

      {/* Referrals list */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-900">Restaurantele recomandate</h2>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-10 text-center">
            <p className="text-sm font-medium text-zinc-700">
              Recomandă primul restaurant și primești 1 lună gratuit imediat
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              + €{cashEur} cash când restaurantul completează prima lună plătită.
              Prietenul tău are 60 de zile gratuit la HIR (vs 30 de zile pentru cei direcți).
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
            {rows.map((row) => {
              const statusLabel =
                REWARD_STATUS_LABEL[row.reward_status] ?? row.reward_status;
              const statusTone =
                REWARD_STATUS_TONE[row.reward_status] ?? 'bg-zinc-100 text-zinc-600 ring-zinc-200';
              const name = row.tenants?.name ?? 'Restaurant necunoscut';
              const date = new Date(row.referred_at).toLocaleDateString('ro-RO', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              });
              return (
                <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-zinc-900 truncate">{name}</span>
                    <span className="text-xs text-zinc-500">{date}</span>
                  </div>
                  <span
                    className={`flex-none rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${statusTone}`}
                  >
                    {statusLabel}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
