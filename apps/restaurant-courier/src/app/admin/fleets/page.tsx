// /admin/fleets — fleet list. PLATFORM_ADMIN only (enforced by layout.tsx).

import Link from 'next/link';
import { requirePlatformAdmin } from '@/lib/platform-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type FleetRow = {
  id: string;
  slug: string;
  name: string;
  brand_color: string;
  tier: 'owner' | 'partner' | 'external';
  allowed_verticals: string[];
  is_active: boolean;
  created_at: string;
  courier_count: number;
};

const TIER_STYLE: Record<string, string> = {
  owner: 'bg-violet-900/60 text-violet-300',
  partner: 'bg-emerald-900/60 text-emerald-300',
  external: 'bg-hir-border text-hir-muted-fg',
};

function VerticalBadges({ verticals }: { verticals: string[] }) {
  return (
    <span className="flex gap-1">
      {verticals.includes('restaurant') && (
        <span aria-label="Restaurant" title="Restaurant" className="text-base">
          🍕
        </span>
      )}
      {verticals.includes('pharma') && (
        <span aria-label="Farmacie" title="Farmacie" className="text-base">
          💊
        </span>
      )}
    </span>
  );
}

export default async function FleetsListPage() {
  await requirePlatformAdmin();

  const admin = createAdminClient();

  // Fetch all fleets.
  const { data: fleets, error } = await (admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        order: (col: string, opts: { ascending: boolean }) => Promise<{
          data: FleetRow[] | null;
          error: { message: string } | null;
        }>;
      };
    };
  })
    .from('courier_fleets')
    .select('id, slug, name, brand_color, tier, allowed_verticals, is_active, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    return (
      <p className="text-sm text-rose-400">
        Eroare la încărcarea flotelor: {error.message}
      </p>
    );
  }

  // Fetch courier counts per fleet in one query.
  const { data: counts } = await (admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => Promise<{
        data: Array<{ fleet_id: string }> | null;
        error: { message: string } | null;
      }>;
    };
  })
    .from('courier_profiles')
    .select('fleet_id');

  const countMap: Record<string, number> = {};
  for (const row of counts ?? []) {
    const fid = (row as { fleet_id: string }).fleet_id;
    countMap[fid] = (countMap[fid] ?? 0) + 1;
  }

  const rows: FleetRow[] = (fleets ?? []).map((f) => ({
    ...f,
    courier_count: countMap[f.id] ?? 0,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-hir-fg">Flote curieri</h1>
          <p className="mt-0.5 text-sm text-hir-muted-fg">
            {rows.length} {rows.length === 1 ? 'flotă' : 'flote'} înregistrate
          </p>
        </div>
        <Link
          href="/admin/fleets/new"
          className="rounded-md bg-violet-600 px-4 py-2 text-xs font-medium text-white hover:bg-violet-700"
        >
          Fleet nou
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-hir-border bg-hir-surface px-6 py-12 text-center">
          <p className="text-sm text-hir-muted-fg">Nicio flotă creată încă.</p>
          <Link
            href="/admin/fleets/new"
            className="mt-4 inline-block rounded-md bg-violet-600 px-4 py-2 text-xs font-medium text-white hover:bg-violet-700"
          >
            Creează prima flotă
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-hir-border bg-hir-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-hir-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-hir-muted-fg">Slug</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-hir-muted-fg">Nume</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-hir-muted-fg">Tier</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-hir-muted-fg">Verticale</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-hir-muted-fg">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-hir-muted-fg">Curieri</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-hir-border">
              {rows.map((fleet) => (
                <tr key={fleet.id} className="hover:bg-hir-border/50">
                  <td className="px-4 py-3 font-mono text-xs text-hir-muted-fg">{fleet.slug}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: fleet.brand_color }}
                      />
                      <span className="font-medium text-hir-fg">{fleet.name}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${TIER_STYLE[fleet.tier] ?? ''}`}
                    >
                      {fleet.tier}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <VerticalBadges verticals={fleet.allowed_verticals} />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        fleet.is_active
                          ? 'bg-emerald-900/60 text-emerald-300'
                          : 'bg-hir-border text-hir-muted-fg'
                      }`}
                    >
                      {fleet.is_active ? 'Activ' : 'Inactiv'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-hir-muted-fg">{fleet.courier_count}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/fleets/${fleet.id}`}
                      className="rounded px-3 py-1.5 text-xs font-medium text-violet-400 hover:bg-hir-border"
                    >
                      Detalii →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
