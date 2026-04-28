import { createServerClient } from '@/lib/supabase/server';
import { getActiveTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

// Track A #11: read-only marketing dashboard. Lists confirmed subscriber
// count + recent signups. The "Trimite campanie" button is intentionally
// disabled for now — full broadcast (with rate limit, unsubscribe footer,
// per-tenant Resend domain) is a separate PR.

type SubscriberRow = {
  id: string;
  email: string;
  status: 'PENDING' | 'CONFIRMED' | 'UNSUBSCRIBED' | 'BOUNCED';
  source: string;
  consent_at: string | null;
  created_at: string;
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function statusLabel(s: SubscriberRow['status']): { label: string; cls: string } {
  switch (s) {
    case 'CONFIRMED':
      return { label: 'Confirmat', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' };
    case 'PENDING':
      return { label: 'În așteptare', cls: 'bg-amber-50 text-amber-700 ring-amber-200' };
    case 'UNSUBSCRIBED':
      return { label: 'Dezabonat', cls: 'bg-zinc-50 text-zinc-600 ring-zinc-200' };
    case 'BOUNCED':
      return { label: 'Respins', cls: 'bg-rose-50 text-rose-700 ring-rose-200' };
  }
}

export default async function NewsletterPage() {
  const { tenant } = await getActiveTenant();
  const supabase = createServerClient();

  // Types package not yet regenerated for newsletter_subscribers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subs = (supabase as any).from('newsletter_subscribers');

  const { data: recentRaw } = await subs
    .select('id, email, status, source, consent_at, created_at')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const recent = (recentRaw ?? []) as SubscriberRow[];

  const counts = recent.reduce(
    (acc, row) => {
      acc.total += 1;
      acc[row.status] += 1;
      return acc;
    },
    { total: 0, CONFIRMED: 0, PENDING: 0, UNSUBSCRIBED: 0, BOUNCED: 0 },
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Newsletter</h1>
        <p className="text-sm text-zinc-600">
          Clienții se abonează din popup-ul de pe storefront și primesc un cod de
          10% reducere după confirmarea adresei.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Confirmați" value={counts.CONFIRMED} accent="emerald" />
        <KpiCard label="În așteptare" value={counts.PENDING} accent="amber" />
        <KpiCard label="Dezabonați" value={counts.UNSUBSCRIBED} accent="zinc" />
        <KpiCard label="Total recenți" value={counts.total} accent="zinc" />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Înscrieri recente</h2>
            <p className="text-xs text-zinc-500">Ultimele 50 de adrese, cele mai noi primele.</p>
          </div>
          <button
            type="button"
            disabled
            title="Disponibil într-un PR viitor — broadcast complet cu rate limit & unsubscribe footer."
            className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-400"
          >
            Trimite campanie
          </button>
        </div>

        {recent.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-zinc-500">
            Niciun abonat încă. Popup-ul apare automat după 30s sau 50% scroll.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Sursă</th>
                  <th className="px-4 py-2 font-medium">Consimțământ</th>
                  <th className="px-4 py-2 font-medium">Înregistrat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {recent.map((row) => {
                  const s = statusLabel(row.status);
                  return (
                    <tr key={row.id}>
                      <td className="px-4 py-2 font-mono text-xs text-zinc-800">{row.email}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${s.cls}`}>
                          {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-zinc-600">{row.source}</td>
                      <td className="px-4 py-2 text-xs text-zinc-600">{fmtDate(row.consent_at)}</td>
                      <td className="px-4 py-2 text-xs text-zinc-600">{fmtDate(row.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: 'emerald' | 'amber' | 'zinc';
}) {
  const tone =
    accent === 'emerald'
      ? 'text-emerald-700'
      : accent === 'amber'
        ? 'text-amber-700'
        : 'text-zinc-700';
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
