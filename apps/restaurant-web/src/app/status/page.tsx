// Public status page (Lane STATUS, 2026-05-05).
//
// No auth, no tenant scoping, intentionally indexable so fleet managers and
// restaurant owners can find it from a "is HIR up?" Google search before a
// pitch meeting.
//
// Data sources:
//   - public.health_monitor_state — current up/down per app
//   - public.health_check_pings   — append-only probe history (90-day uptime)
//   - public.public_incidents     — operator-curated incidents (last 30 days)
//
// Cached for 60s via `export const revalidate = 60` — no live polling, page
// stays fast and Supabase load stays bounded.

import type { Metadata } from 'next';
import {
  MarketingHeader,
  MarketingFooter,
} from '@/components/marketing/marketing-shell';
import { StatusBadge } from '@/components/status/status-badge';
import { ServiceTile } from '@/components/status/service-tile';
import { UptimeBars } from '@/components/status/uptime-bars';
import { IncidentList } from '@/components/status/incident-list';
import { loadStatusSnapshot, MONITORED_APPS } from './data';

export const runtime = 'nodejs';
// Cache for 60s — health-monitor cron runs every 5 min, so a tighter window
// would only burn CPU without surfacing new data.
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Status platformă — HIR Restaurant Suite',
  description:
    'Status în timp real al platformei HIR: storefront, admin, aplicație curier. Uptime 90 zile + incidente recente.',
  openGraph: {
    title: 'Status HIR Restaurant Suite',
    description: 'Disponibilitate platformă în timp real + incidente.',
    type: 'website',
    locale: 'ro_RO',
  },
  // Indexable by default — fleet managers and restaurant owners searching
  // "HIR uptime" should find this. Add `noindex` to the page meta block
  // below if Iulian later decides credibility play isn't needed.
  robots: { index: true, follow: true },
};

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ro-RO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default async function StatusPage() {
  let snapshot;
  let loadError: string | null = null;
  try {
    snapshot = await loadStatusSnapshot();
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'Eroare necunoscută';
    snapshot = null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC]">
      <MarketingHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A] sm:text-3xl">
            Status platformă
          </h1>
          <p className="mt-2 text-sm text-[#475569]">
            Disponibilitatea în timp real a serviciilor HIR Restaurant Suite. Datele se
            actualizează la fiecare 5 minute.
          </p>
        </header>

        {loadError || !snapshot ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            Nu am putut încărca datele despre status. Încercați din nou peste câteva minute.
          </div>
        ) : (
          <div className="space-y-8">
            <section aria-labelledby="overall-heading">
              <h2 id="overall-heading" className="sr-only">
                Status general
              </h2>
              <StatusBadge overall={snapshot.overall} />
            </section>

            <section aria-labelledby="services-heading">
              <h2
                id="services-heading"
                className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#475569]"
              >
                Servicii
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {snapshot.services.map((s) => (
                  <ServiceTile key={s.app} service={s} />
                ))}
              </div>
            </section>

            <section aria-labelledby="uptime-heading">
              <h2
                id="uptime-heading"
                className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#475569]"
              >
                Uptime 90 zile
              </h2>
              <div className="space-y-3">
                {MONITORED_APPS.map((m) => (
                  <UptimeBars
                    key={m.id}
                    label={m.label}
                    buckets={snapshot.uptime[m.id]}
                  />
                ))}
              </div>
              <p className="mt-3 flex flex-wrap gap-3 text-xs text-[#64748B]">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-emerald-500" />
                  ≥ 99.9%
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-amber-400" />
                  95-99.9%
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-rose-500" />
                  &lt; 95%
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-zinc-200" />
                  fără date
                </span>
              </p>
            </section>

            <section aria-labelledby="incidents-heading">
              <h2
                id="incidents-heading"
                className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#475569]"
              >
                Incidente recente (30 zile)
              </h2>
              <IncidentList incidents={snapshot.incidents} />
            </section>

            <p className="text-xs text-[#94A3B8]">
              Generat la {fmtDateTime(snapshot.generatedAt)}. Probe-urile sunt automate, la
              fiecare 5 minute, din infrastructura noastră de monitorizare.
            </p>
          </div>
        )}
      </main>
      <MarketingFooter />
    </div>
  );
}
