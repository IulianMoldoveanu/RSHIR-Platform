import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logoutAction } from '../dashboard/actions';

export const dynamic = 'force-dynamic';

// /fleet — top-level surface for FLEET role (fleet manager). Mirrors
// /partner-portal's pattern: one layout owns auth gating + role lookup,
// then renders a focused nav for fleet-only operations.
//
// A user reaches /fleet via login (middleware) -> /dashboard layout
// (`dashboard/layout.tsx` detects no tenant membership but owns a
// `courier_fleets` row -> 302 to /fleet). Direct navigation to /fleet
// without owning a fleet shows the "no fleet attached" panel below.
//
// Hepi access is gated on `fleet_kyf.kyf_status = VERIFIED` (Iulian
// approves docs via /dashboard/admin/verifications). Until then the
// landing page surfaces the KYF status + upload CTA only.

type FleetRow = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  kyf_required: boolean;
  fleet_kyf: { kyf_status: 'PENDING' | 'VERIFIED' | 'REJECTED' } | { kyf_status: 'PENDING' | 'VERIFIED' | 'REJECTED' }[] | null;
};

export default async function FleetLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('courier_fleets')
    .select('id, slug, name, is_active, kyf_required, fleet_kyf:fleet_kyf(kyf_status)')
    .eq('owner_user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[fleet/layout] fleet lookup error:', error.message);
  }

  const fleet = data as FleetRow | null;

  if (!fleet) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 text-center">
        <div className="max-w-md rounded-xl border border-amber-200 bg-white p-6 shadow-sm">
          <h1 className="text-base font-semibold text-zinc-900">
            Contul tau nu e conectat la o flota
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Daca esti manager de flota, inregistreaza flota din pagina dedicata.
            Daca esti restaurant, foloseste dashboard-ul de restaurant.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
            <a
              href="/fleet-signup"
              className="rounded-md bg-purple-600 px-3 py-2 font-medium text-white hover:bg-purple-700"
            >
              Inregistreaza flota
            </a>
            <a
              href="/dashboard"
              className="rounded-md border border-zinc-300 px-3 py-2 font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Catre restaurant
            </a>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md border border-zinc-300 px-3 py-2 font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Logout
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  const kyfRaw = fleet.fleet_kyf;
  const kyfStatus =
    (Array.isArray(kyfRaw) ? kyfRaw[0]?.kyf_status : kyfRaw?.kyf_status) ?? 'PENDING';
  const isVerified = kyfStatus === 'VERIFIED';

  // Panoul de control complet (orders dispatch, couriers, payouts, live map)
  // traieste pe HIR Curier (courier.hirforyou.ro/fleet/*) — built pentru
  // fleet managers cu requireFleetManager() server-side. Linkurile externe
  // se deschid in tab nou (target=_blank) ca sa pastram sesiunea admin
  // intacta in timp ce fleet managerul actioneaza din cealalta tab.
  // Single-login cross-subdomain este P1 follow-up (cookie domain
  // .hirforyou.ro pe ambele middleware-uri).
  const FLEET_OPS_HOST = 'https://courier.hirforyou.ro';
  const navLinks = [
    { href: '/fleet', label: 'Acasa', external: false, dot: false },
    { href: '/fleet/kyf', label: 'Verificare KYF', external: false, dot: !isVerified },
    ...(isVerified
      ? [
          { href: '/fleet/tariffs', label: 'Tarife (curier + vendor)', external: false, dot: false },
          { href: `${FLEET_OPS_HOST}/fleet`, label: 'Panou de control', external: true, dot: false },
          { href: `${FLEET_OPS_HOST}/fleet/orders`, label: 'Comenzi & dispatch', external: true, dot: false },
          { href: `${FLEET_OPS_HOST}/fleet/couriers`, label: 'Curieri', external: true, dot: false },
          { href: `${FLEET_OPS_HOST}/fleet/payouts`, label: 'Plati', external: true, dot: false },
          { href: '/fleet/hepi', label: 'Hepi - self improvements', external: false, dot: false },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside className="hidden w-52 flex-col border-r border-zinc-200 bg-white lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-zinc-200 px-4">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-xs font-bold text-white"
          >
            F
          </span>
          <span className="text-sm font-semibold tracking-tight text-zinc-900">HIR Flota</span>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2 text-sm">
          {navLinks.map((link) =>
            link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-md border-l-2 border-transparent px-3 py-2 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
              >
                <span>{link.label}</span>
                <span aria-hidden className="text-[10px] text-zinc-400">↗</span>
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center justify-between rounded-md border-l-2 border-transparent px-3 py-2 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
              >
                <span>{link.label}</span>
                {link.dot ? (
                  <span aria-hidden className="h-2 w-2 rounded-full bg-rose-500" />
                ) : null}
              </Link>
            ),
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 sm:px-6">
          <span className="text-sm font-medium text-zinc-700">
            Flota — {fleet.name}
            {!isVerified ? (
              <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                KYF in asteptare
              </span>
            ) : null}
          </span>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-zinc-500 md:inline">{user.email}</span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
              >
                Logout
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
