// B2B Marketplace — vendor listings index.
//
// Strategy Master Plan Section 5 (B2B Marketplace), Stream 5/9 (UI vendor side).
// Lists all listings owned by the tenants the current user belongs to, with
// status badges, offer counts, and quick filters by status.
//
// Feature flag: HIR_FEATURE_MARKETPLACE_ENABLED gates the whole surface via
// notFound() at the top. Once flipped on, RLS in 20260616_009 limits the rows
// fetched by the typed admin client (service_role bypasses RLS, so we filter
// by tenant_members explicitly to keep the data-plane honest).

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClientUntyped } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type ListingStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'MATCHED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'DISPUTED';

type ListingRow = {
  id: string;
  vertical: string;
  status: ListingStatus;
  city_name: string | null;
  delivery_window_start: string;
  delivery_window_end: string;
  pickup_summary: string;
  dropoff_summary: string;
  package_description: string | null;
  created_at: string;
  offer_count: number;
};

const STATUS_BADGE: Record<ListingStatus, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  OPEN: { label: 'Deschis', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  MATCHED: { label: 'Atribuit', cls: 'bg-indigo-100 text-indigo-800 ring-indigo-200' },
  IN_PROGRESS: { label: 'În livrare', cls: 'bg-sky-100 text-sky-800 ring-sky-200' },
  COMPLETED: { label: 'Livrat', cls: 'bg-teal-100 text-teal-800 ring-teal-200' },
  CANCELLED: { label: 'Anulat', cls: 'bg-zinc-100 text-zinc-500 ring-zinc-200' },
  EXPIRED: { label: 'Expirat', cls: 'bg-amber-100 text-amber-800 ring-amber-200' },
  DISPUTED: { label: 'Dispută', cls: 'bg-rose-100 text-rose-800 ring-rose-200' },
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function summarizeAddress(addr: unknown): string {
  if (!addr || typeof addr !== 'object') return '—';
  const a = addr as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof a.street === 'string') parts.push(a.street);
  if (typeof a.number === 'string') parts.push(a.number);
  if (typeof a.city === 'string') parts.push(a.city);
  const joined = parts.filter(Boolean).join(' ');
  return joined === '' ? '—' : joined;
}

export default async function MarketplaceListingsPage(): Promise<JSX.Element> {
  if (process.env.HIR_FEATURE_MARKETPLACE_ENABLED !== 'true') notFound();

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClientUntyped();

  // 1. Resolve the tenants the user belongs to. Empty list = no marketplace
  //    access (the user belongs to no vendor tenant).
  const { data: memberships, error: memberErr } = await admin
    .from('tenant_members')
    .select('tenant_id, tenants:tenants(id, name)')
    .eq('user_id', user.id);

  if (memberErr) {
    return (
      <EmptyShell
        title="Marketplace — Cereri"
        message={`Eroare la încărcarea restaurantelor: ${memberErr.message}`}
      />
    );
  }

  const tenantIds: string[] = (memberships ?? [])
    .map((m: { tenant_id: string | null }) => m.tenant_id)
    .filter((x: string | null): x is string => typeof x === 'string' && x.length > 0);

  if (tenantIds.length === 0) {
    return (
      <EmptyShell
        title="Marketplace — Cereri"
        message="Nu ești asociat niciunui restaurant. Contactează administratorul HIR pentru acces."
      />
    );
  }

  // 2. Fetch listings for those tenants. Embed city for display, count offers
  //    inline via the embedded relation.
  const { data: rawListings, error: listingsErr } = await admin
    .from('marketplace_listings')
    .select(
      [
        'id',
        'vertical',
        'status',
        'delivery_window_start',
        'delivery_window_end',
        'pickup_address',
        'dropoff_address',
        'package_description',
        'created_at',
        'cities:cities(name)',
        'marketplace_offers(count)',
      ].join(', '),
    )
    .in('vendor_tenant_id', tenantIds)
    .order('created_at', { ascending: false })
    .limit(100);

  if (listingsErr) {
    return (
      <EmptyShell
        title="Marketplace — Cereri"
        message={`Eroare la încărcarea cererilor: ${listingsErr.message}`}
      />
    );
  }

  const listings: ListingRow[] = (rawListings ?? []).map(
    (r: {
      id: string;
      vertical: string;
      status: ListingStatus;
      delivery_window_start: string;
      delivery_window_end: string;
      pickup_address: unknown;
      dropoff_address: unknown;
      package_description: string | null;
      created_at: string;
      cities: { name: string } | null;
      marketplace_offers: Array<{ count: number }> | { count: number } | null;
    }) => {
      let offerCount = 0;
      if (Array.isArray(r.marketplace_offers)) {
        offerCount = r.marketplace_offers.reduce(
          (n: number, x: { count: number }) => n + (Number(x.count) || 0),
          0,
        );
      } else if (r.marketplace_offers && typeof r.marketplace_offers === 'object') {
        offerCount = Number((r.marketplace_offers as { count: number }).count) || 0;
      }
      return {
        id: r.id,
        vertical: r.vertical,
        status: r.status,
        city_name: r.cities?.name ?? null,
        delivery_window_start: r.delivery_window_start,
        delivery_window_end: r.delivery_window_end,
        pickup_summary: summarizeAddress(r.pickup_address),
        dropoff_summary: summarizeAddress(r.dropoff_address),
        package_description: r.package_description,
        created_at: r.created_at,
        offer_count: offerCount,
      };
    },
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
      <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Marketplace — Cererile mele</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Publică o cerere de livrare B2B și primește oferte de la flotele HIR.
          </p>
        </div>
        <Link
          href="/marketplace/listings/new"
          className="inline-flex items-center justify-center rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:ring-offset-2"
        >
          Cerere nouă
        </Link>
      </header>

      {listings.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3 text-left font-medium">Oraș</th>
                <th className="px-4 py-3 text-left font-medium">Interval livrare</th>
                <th className="px-4 py-3 text-left font-medium">Ridicare → Livrare</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Oferte</th>
                <th className="px-4 py-3 text-right font-medium">Acțiuni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {listings.map((l) => {
                const badge = STATUS_BADGE[l.status];
                return (
                  <tr key={l.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 text-zinc-700">{l.city_name ?? '—'}</td>
                    <td className="px-4 py-3 text-zinc-700">
                      <div className="text-xs text-zinc-500">început</div>
                      <div className="tabular-nums">{fmtDateTime(l.delivery_window_start)}</div>
                      <div className="mt-1 text-xs text-zinc-500">sfârșit</div>
                      <div className="tabular-nums">{fmtDateTime(l.delivery_window_end)}</div>
                    </td>
                    <td className="max-w-[260px] truncate px-4 py-3 text-zinc-700">
                      <span className="block truncate" title={l.pickup_summary}>
                        {l.pickup_summary}
                      </span>
                      <span className="block truncate text-xs text-zinc-500" title={l.dropoff_summary}>
                        → {l.dropoff_summary}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-700">
                      {l.offer_count}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/marketplace/listings/${l.id}`}
                        className="text-sm font-medium text-purple-700 hover:text-purple-900"
                      >
                        Deschide →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function EmptyState(): JSX.Element {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
      <p className="text-sm text-zinc-500">
        Nu există cereri active. Publică prima cerere folosind butonul de mai sus.
      </p>
      <Link
        href="/marketplace/listings/new"
        className="mt-4 inline-flex items-center justify-center rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-purple-700"
      >
        Publică prima cerere
      </Link>
    </div>
  );
}

function EmptyShell({ title, message }: { title: string; message: string }): JSX.Element {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
      <h1 className="text-2xl font-semibold text-zinc-900">{title}</h1>
      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
        {message}
      </div>
    </main>
  );
}
