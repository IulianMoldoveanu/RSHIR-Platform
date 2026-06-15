import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// /fleet — landing page for the FLEET role. Layout already proved the
// user owns a courier_fleets row; this page surfaces KYF status, the
// next step the manager needs to take, and Hepi gating.

type Snapshot = {
  fleet: { id: string; name: string; slug: string; is_active: boolean };
  kyf: { kyf_status: 'PENDING' | 'VERIFIED' | 'REJECTED'; cui: string | null; company_name: string | null } | null;
};

async function loadSnapshot(): Promise<Snapshot> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: fleet } = await admin
    .from('courier_fleets')
    .select('id, name, slug, is_active')
    .eq('owner_user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!fleet) redirect('/fleet-signup');

  const { data: kyf } = await admin
    .from('fleet_kyf')
    .select('kyf_status, cui, company_name')
    .eq('fleet_id', fleet.id)
    .maybeSingle();

  return { fleet, kyf };
}

export default async function FleetHome() {
  const { fleet, kyf } = await loadSnapshot();
  const kyfStatus = kyf?.kyf_status ?? 'PENDING';
  const isVerified = kyfStatus === 'VERIFIED';
  const isRejected = kyfStatus === 'REJECTED';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Bun venit, {fleet.name}</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Aici controlezi flota ta de curieri pe reteaua HIR. Pentru acces complet (curieri, comenzi, plati,
          Hepi self-improvements), trebuie sa verifici flota cu documentele cerute.
        </p>
      </div>

      <section
        className={`rounded-xl border p-5 ${
          isVerified
            ? 'border-emerald-200 bg-emerald-50'
            : isRejected
              ? 'border-rose-200 bg-rose-50'
              : 'border-amber-200 bg-amber-50'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">
              Verificare KYF (Know Your Fleet)
            </h2>
            <p className="mt-1 text-sm text-zinc-700">
              {isVerified
                ? 'Flota ta este verificata si activa. Toate functiile sunt deblocate.'
                : isRejected
                  ? 'Verificarea KYF a fost respinsa. Recontacteaza administratorul HIR si revizuieste documentele.'
                  : 'Verificarea este in curs. Incarca documentele de identificare pentru a fi aprobat de administrator.'}
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              CUI: {kyf?.cui ?? '—'} · Firma: {kyf?.company_name ?? fleet.name}
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
              isVerified
                ? 'bg-emerald-600 text-white'
                : isRejected
                  ? 'bg-rose-600 text-white'
                  : 'bg-amber-600 text-white'
            }`}
          >
            {kyfStatus}
          </span>
        </div>
        {!isVerified ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/fleet/kyf"
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              {isRejected ? 'Revizuieste documentele' : 'Incarca documente KYF'}
            </Link>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <FeatureCard
          title="Panou de control (operare)"
          desc="Comenzi live, dispatch catre curieri, harta flotei in timp real."
          href="https://courier.hirforyou.ro/fleet"
          external
          locked={!isVerified}
          badge="HIR Curier"
        />
        <FeatureCard
          title="Comenzi & dispatch"
          desc="Vezi comenzile alocate flotei si asigneaza-le curierilor disponibili."
          href="https://courier.hirforyou.ro/fleet/orders"
          external
          locked={!isVerified}
        />
        <FeatureCard
          title="Curierii mei"
          desc="Lista curierilor flotei tale + status KYC. Nume prefixat cu acronimul firmei."
          href="/fleet/couriers"
          locked={!isVerified}
        />
        <FeatureCard
          title="Plati"
          desc="Plati saptamanale catre HIR (factura) si catre curierii tai."
          href="https://courier.hirforyou.ro/fleet/payouts"
          external
          locked={!isVerified}
        />
        <FeatureCard
          title="Tarife (curier + vendor)"
          desc="Setezi cat platesti curierilor si cat incasezi de la vendori. Pickup fix + RON/km. Auto-sync cu HIR Curier."
          href="/fleet/tariffs"
          locked={!isVerified}
        />
        <FeatureCard
          title="Hepi — self improvements"
          desc="Asistent AI cu recomandari personalizate pentru cresterea flotei."
          href="/fleet/hepi"
          locked={!isVerified}
          badge="AI"
        />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-zinc-900">Ce urmeaza?</h3>
        <ol className="mt-3 space-y-2 text-sm text-zinc-700">
          <li className={isVerified ? 'text-zinc-400 line-through' : ''}>
            1. Incarca documentele KYF (CUI, ONRC, asigurare, ID administrator).
          </li>
          <li className={isVerified ? 'text-zinc-400 line-through' : ''}>
            2. Administratorul HIR confirma flota (de regula sub 24h).
          </li>
          <li className={isVerified ? '' : 'text-zinc-400'}>
            3. Invita curieri si incepe sa primesti comenzi de la HIR Connect / agregator.
          </li>
        </ol>
      </section>
    </div>
  );
}

function FeatureCard({
  title,
  desc,
  href,
  locked,
  badge,
  external,
}: {
  title: string;
  desc: string;
  href: string;
  locked: boolean;
  badge?: string;
  external?: boolean;
}) {
  const content = (
    <div
      className={`rounded-xl border p-4 transition ${
        locked
          ? 'border-zinc-200 bg-zinc-50 opacity-60'
          : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900">{title}</h4>
        {locked ? (
          <span className="text-[10px] font-semibold uppercase text-amber-700">Locked</span>
        ) : badge ? (
          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
            {badge}
          </span>
        ) : external ? (
          <span aria-hidden className="text-[10px] text-zinc-400">↗</span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-zinc-600">{desc}</p>
    </div>
  );
  if (locked) return content;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }
  return <Link href={href}>{content}</Link>;
}
