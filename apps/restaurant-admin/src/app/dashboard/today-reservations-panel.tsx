import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';

// "Today" + "tomorrow" in Bucharest local — for a restaurant operator the
// only reservations that matter at a glance are the ones happening soon.
function todayBucharestRange(): { fromIso: string; toIso: string } {
  const now = new Date();
  // Compute today's 00:00 in Europe/Bucharest, then add 48h. Doing this via
  // a fixed offset is incorrect across DST; instead, derive the YYYY-MM-DD
  // in Bucharest and parse back as a local-tz boundary.
  const todayKey = now.toLocaleDateString('en-CA', {
    timeZone: 'Europe/Bucharest',
  });
  // Postgres timestamptz parses ISO with offset. We pass the boundary as the
  // start of the day in UTC, which in practice covers a 25h overlap window
  // — accepting up to 1h of "yesterday late night" / "tomorrow late night"
  // bleed is fine for a dashboard glance.
  const fromIso = `${todayKey}T00:00:00Z`;
  const to = new Date(`${todayKey}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() + 2);
  return { fromIso, toIso: to.toISOString() };
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ro-RO', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Bucharest',
  });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const todayKey = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Europe/Bucharest',
  });
  const dKey = d.toLocaleDateString('en-CA', { timeZone: 'Europe/Bucharest' });
  if (dKey === todayKey) return 'Azi';
  return 'Mâine';
}

export async function TodayReservationsPanel({ tenantId }: { tenantId: string }) {
  const { fromIso, toIso } = todayBucharestRange();
  const admin = createAdminClient();
  // reservations table not yet in generated types; same any-cast pattern
  // used elsewhere in the admin app.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data } = await sb
    .from('reservations')
    .select('id, customer_first_name, party_size, requested_at, status')
    .eq('tenant_id', tenantId)
    .in('status', ['REQUESTED', 'CONFIRMED'])
    .gte('requested_at', fromIso)
    .lt('requested_at', toIso)
    .order('requested_at', { ascending: true })
    .limit(8);

  const rows = (data ?? []) as Array<{
    id: string;
    customer_first_name: string;
    party_size: number;
    requested_at: string;
    status: 'REQUESTED' | 'CONFIRMED';
  }>;

  // Hide entirely when nothing's booked — the dashboard already has plenty
  // of cards. An empty rezervări block on a restaurant with reservations
  // disabled would be pure noise.
  if (rows.length === 0) return null;

  const totalGuests = rows.reduce((sum, r) => sum + r.party_size, 0);
  const pendingCount = rows.filter((r) => r.status === 'REQUESTED').length;

  return (
    <section aria-label="Rezervări în următoarele 48h">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-zinc-700">
          Rezervări 48h{' '}
          <span className="ml-2 text-xs font-normal text-zinc-500">
            · {totalGuests} persoane
            {pendingCount > 0 && (
              <span className="ml-1 text-amber-700">
                · {pendingCount} {pendingCount === 1 ? 'cerere' : 'cereri'}
              </span>
            )}
          </span>
        </h2>
        <Link
          href="/dashboard/reservations"
          className="text-xs font-medium text-purple-700 hover:text-purple-900"
        >
          Vezi toate →
        </Link>
      </div>
      <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href="/dashboard/reservations"
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-zinc-50"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-700">
                  {dayLabel(r.requested_at)}
                </span>
                <span className="font-mono tabular-nums text-xs text-zinc-700">
                  {fmtTime(r.requested_at)}
                </span>
                <span className="truncate font-medium text-zinc-800">
                  {r.customer_first_name}
                </span>
                {r.status === 'REQUESTED' && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-900">
                    cerere
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-500">
                <span className="tabular-nums">👥 {r.party_size}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
