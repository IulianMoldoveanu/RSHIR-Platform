// Platform-admin Operator Actions dashboard.
//
// Single page listing every operator-gated item that's been floating
// across memory entries (Stripe key, Anthropic top-up, Twilio creds,
// PSP credentials, mobile store accounts, etc.). Each row probes a
// LOCAL signal (env var present, vault row exists, bucket private)
// and renders DONE / PENDING / UNKNOWN — never the secret itself.
//
// No outbound HTTP to paid APIs. No mutations. Read-only.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import type { ProbeResult } from './health-checks';
import { ITEMS } from './catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function statusClass(status: ProbeResult['status']): string {
  if (status === 'DONE') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (status === 'PENDING') return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-zinc-100 text-zinc-700 border-zinc-200';
}

function statusLabel(status: ProbeResult['status']): string {
  if (status === 'DONE') return 'GATA';
  if (status === 'PENDING') return 'DE FĂCUT';
  return 'NECUNOSCUT';
}

export default async function OperatorActionsPage() {
  const supa = await createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();

  if (!user?.email) redirect('/login?next=/dashboard/admin/system/operator-actions');

  if (!isPlatformAdminEmail(user.email)) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Acces interzis: această pagină este rezervată administratorilor HIR.
      </div>
    );
  }

  const results = await Promise.all(
    ITEMS.map(async (item) => {
      try {
        const probe = await item.probe();
        return { item, probe };
      } catch (e) {
        return { item, probe: { status: 'UNKNOWN' as const, detail: (e as Error).message } };
      }
    }),
  );

  const counts = { DONE: 0, PENDING: 0, UNKNOWN: 0 };
  for (const r of results) counts[r.probe.status] += 1;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Operator actions</h1>
        <p className="text-sm text-zinc-600">
          Toate elementele care depind de o intervenție manuală — chei, conturi vendor, decizii operaționale.
          Probele sunt locale (env + metadata Supabase); nu apelăm API-uri externe plătite.
        </p>
        <div className="mt-2 flex gap-2 text-xs">
          <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-medium ${statusClass('DONE')}`}>
            {counts.DONE} GATA
          </span>
          <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-medium ${statusClass('PENDING')}`}>
            {counts.PENDING} DE FĂCUT
          </span>
          <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-medium ${statusClass('UNKNOWN')}`}>
            {counts.UNKNOWN} NECUNOSCUT
          </span>
          <span className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-white px-2 py-0.5 font-medium text-zinc-600">
            {ITEMS.length} total
          </span>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {results.map(({ item, probe }) => (
          <article key={item.key} className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-medium text-zinc-900">{item.name}</h2>
              <span
                className={`inline-flex shrink-0 items-center rounded border px-2 py-0.5 text-[11px] font-medium ${statusClass(probe.status)}`}
              >
                {statusLabel(probe.status)}
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              <span className="font-medium text-zinc-700">Blochează: </span>
              {item.blocks}
            </p>
            <p className="mt-2 text-xs text-zinc-700">{item.howToResolve}</p>
            {probe.detail && (
              <p className="mt-2 text-[11px] text-zinc-500">
                <span className="font-medium">Stare: </span>
                {probe.detail}
              </p>
            )}
            {item.resolveUrl && (
              <a
                href={item.resolveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-xs font-medium text-blue-700 hover:underline"
              >
                Deschide consola →
              </a>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
