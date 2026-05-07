// Lane VOICE-CHANNEL-TWILIO-SKELETON — read-only call log.
// Lists the most recent voice calls for the active tenant.

import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

type VoiceCallRow = {
  id: string;
  twilio_call_sid: string;
  from_number: string | null;
  to_number: string | null;
  transcript: string | null;
  intent: string | null;
  response: string | null;
  duration_seconds: number | null;
  status: 'received' | 'processed' | 'failed';
  created_at: string;
  metadata: Record<string, unknown> | null;
};

const RO_DT = new Intl.DateTimeFormat('ro-RO', {
  timeZone: 'Europe/Bucharest',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function fmtDate(iso: string): string {
  try {
    return RO_DT.format(new Date(iso));
  } catch {
    return iso;
  }
}

function StatusPill({ status }: { status: VoiceCallRow['status'] }) {
  const map: Record<VoiceCallRow['status'], { label: string; cls: string }> = {
    received: { label: 'Primit', cls: 'bg-sky-100 text-sky-800' },
    processed: { label: 'Procesat', cls: 'bg-emerald-100 text-emerald-800' },
    failed: { label: 'Eșuat', cls: 'bg-rose-100 text-rose-800' },
  };
  const m = map[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

export default async function VoiceCallsPage() {
  const { tenant } = await getActiveTenant();
  const admin = createAdminClient();

  // voice_calls is not yet in the generated supabase types
  // (migration 20260609_001_voice_calls.sql ships in this commit).
  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => Promise<{
              data: Record<string, unknown>[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };

  const { data: rowsRaw } = await sb
    .from('voice_calls')
    .select(
      'id, twilio_call_sid, from_number, to_number, transcript, intent, response, duration_seconds, status, created_at, metadata',
    )
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .limit(50);
  const rows = (rowsRaw ?? []) as unknown as VoiceCallRow[];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Apeluri vocale
          </h1>
          <p className="max-w-3xl text-sm text-zinc-600">
            Ultimele 50 de apeluri preluate prin Twilio. Pentru configurare consultați{' '}
            <Link
              href="/dashboard/settings/voice"
              className="font-medium text-purple-700 hover:underline"
            >
              Canal vocal — setări
            </Link>
            .
          </p>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-10 text-center">
          <p className="text-sm font-medium text-zinc-800">
            Niciun apel înregistrat încă.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            După ce conectați un număr Twilio și activați canalul vocal,
            apelurile primite vor apărea aici.
          </p>
          <Link
            href="/dashboard/settings/voice"
            className="mt-4 inline-flex items-center rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
          >
            Configurează Twilio
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">De la</th>
                <th className="px-3 py-2">Stare</th>
                <th className="px-3 py-2">Durată</th>
                <th className="px-3 py-2">Intenție</th>
                <th className="px-3 py-2">Transcriere</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {rows.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-600">
                    {fmtDate(row.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                    {row.from_number ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={row.status} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-600">
                    {row.duration_seconds !== null ? `${row.duration_seconds}s` : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    {row.intent ? (
                      <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px]">
                        {row.intent}
                      </code>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-700">
                    {row.transcript ? (
                      <span className="line-clamp-3">{row.transcript}</span>
                    ) : (
                      <span className="italic text-zinc-400">
                        {row.status === 'received'
                          ? 'În curs…'
                          : 'Fără transcriere'}
                      </span>
                    )}
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
