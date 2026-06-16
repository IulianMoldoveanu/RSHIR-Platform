// /partner-portal/commissions — read-only commission ledger.
//
// Lists rows from partner_commissions for this partner with filters
// (status / type / period) driven via search params (URL-shareable).
// CSV export is rendered client-side by a small companion component so
// the partner can save their own books without us building a download
// endpoint.
//
// Auth is enforced by layout.tsx; we still re-resolve the partner row
// here so the SELECT is always partner-scoped (defense in depth — no
// cross-partner leak even if a future routing bug ever bypasses the
// layout gate).

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CommissionExportButton, type CommissionRow } from './_components/export-button';

export const dynamic = 'force-dynamic';

type CommissionType = 'DIRECT' | 'WAVE_BONUS' | 'OVERRIDE' | 'CHAMPION_GIFT' | string;
type CommissionStatus = 'PENDING' | 'PAYABLE' | 'PAID' | 'VOID' | string;

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'În așteptare',
  PAYABLE: 'De plată',
  PAID: 'Plătit',
  VOID: 'Anulat',
};

const STATUS_TONE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  PAYABLE: 'bg-indigo-100 text-indigo-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  VOID: 'bg-zinc-100 text-zinc-500',
};

const TYPE_LABEL: Record<string, string> = {
  DIRECT: 'Direct (Y1/Y2)',
  WAVE_BONUS: 'Bonus Wave',
  OVERRIDE: 'Override echipă',
  CHAMPION_GIFT: 'Cadou Champion',
};

const TYPE_TONE: Record<string, string> = {
  DIRECT: 'bg-purple-100 text-purple-800 ring-purple-200',
  WAVE_BONUS: 'bg-rose-100 text-rose-800 ring-rose-200',
  OVERRIDE: 'bg-sky-100 text-sky-800 ring-sky-200',
  CHAMPION_GIFT: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
};

const ALL_STATUSES: CommissionStatus[] = ['PENDING', 'PAYABLE', 'PAID', 'VOID'];
const ALL_TYPES: CommissionType[] = ['DIRECT', 'WAVE_BONUS', 'OVERRIDE', 'CHAMPION_GIFT'];

function centsToRon(cents: number): string {
  return (cents / 100).toLocaleString('ro-RO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

type RawRow = {
  id: string;
  period_start: string;
  period_end: string;
  amount_cents: number;
  order_count: number;
  status: CommissionStatus;
  paid_at: string | null;
  commission_type: CommissionType | null;
};

export default async function CommissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const statusFilter = sp.status ?? '';
  const typeFilter = sp.type ?? '';

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: rawPartner } = await admin
    .from('partners')
    .select('id')
    .eq('user_id', user.id)
    .in('status', ['PENDING', 'ACTIVE'])
    .maybeSingle();
  if (!rawPartner) redirect('/login');
  const partnerId = rawPartner.id as string;

  // Pull last 24 months unconditionally; filter server-side after to keep
  // the SQL simple. 24 × monthly × 4 types = bounded at ~96 rows worst case.
  const { data: rawRows } = await admin
    .from('partner_commissions')
    .select(
      'id, period_start, period_end, amount_cents, order_count, status, paid_at, commission_type',
    )
    .eq('partner_id', partnerId)
    .order('period_start', { ascending: false })
    .limit(200);

  const rows: RawRow[] = ((rawRows ?? []) as RawRow[]).map((r) => ({
    id: r.id,
    period_start: r.period_start,
    period_end: r.period_end,
    amount_cents: Number(r.amount_cents),
    order_count: r.order_count,
    status: r.status,
    paid_at: r.paid_at,
    commission_type: r.commission_type,
  }));

  const filtered = rows.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (typeFilter && (r.commission_type ?? '') !== typeFilter) return false;
    return true;
  });

  // Summary across the filtered set
  const sumPaid = filtered
    .filter((r) => r.status === 'PAID')
    .reduce((acc, r) => acc + r.amount_cents, 0);
  const sumPending = filtered
    .filter((r) => r.status === 'PENDING' || r.status === 'PAYABLE')
    .reduce((acc, r) => acc + r.amount_cents, 0);
  const sumOrders = filtered.reduce((acc, r) => acc + r.order_count, 0);

  // CSV row shape — the client component encodes this in-browser
  const csvRows: CommissionRow[] = filtered.map((r) => ({
    period_start: r.period_start,
    period_end: r.period_end,
    type: r.commission_type ?? '',
    status: r.status,
    orders: r.order_count,
    amount_ron: Math.round(r.amount_cents) / 100,
    paid_at: r.paid_at ?? '',
  }));

  return (
    <div className="flex flex-col gap-6 pb-20 lg:pb-0">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
          Comisioane
        </h1>
        <p className="text-sm text-zinc-600">
          Toate comisioanele tale — directe, bonus Wave, override pe echipă și
          cadouri Champion. Filtrele de mai jos se păstrează în URL, deci
          poți partaja o vedere către contabilul tău.
        </p>
      </header>

      {/* Summary row */}
      <section
        aria-label="Sumar comisioane"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <SummaryTile label="Total rânduri" value={String(filtered.length)} sub="după filtre" />
        <SummaryTile
          label="Plătit"
          value={`${centsToRon(sumPaid)} RON`}
          sub="status PAID"
          tone="emerald"
        />
        <SummaryTile
          label="În așteptare"
          value={`${centsToRon(sumPending)} RON`}
          sub="PENDING + PAYABLE"
          tone="amber"
        />
        <SummaryTile
          label="Comenzi acoperite"
          value={String(sumOrders)}
          sub="total livrate"
        />
      </section>

      {/* Filters (GET form — URL-shareable, server-rendered) */}
      <form
        method="get"
        className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-end"
        aria-label="Filtrează comisioanele"
      >
        <div className="flex-1">
          <label
            htmlFor="status"
            className="mb-1 block text-xs font-medium text-zinc-700"
          >
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={statusFilter}
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="">Toate statusurile</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s] ?? s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label htmlFor="type" className="mb-1 block text-xs font-medium text-zinc-700">
            Tip comision
          </label>
          <select
            id="type"
            name="type"
            defaultValue={typeFilter}
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="">Toate tipurile</option>
            {ALL_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t] ?? t}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
          >
            Aplică
          </button>
          {(statusFilter || typeFilter) && (
            <a
              href="/partner-portal/commissions"
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Resetează
            </a>
          )}
          <CommissionExportButton rows={csvRows} />
        </div>
      </form>

      {/* Table */}
      <section aria-label="Listă comisioane">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
            <p className="text-sm text-zinc-500">
              {rows.length === 0
                ? 'Nu există comisioane înregistrate încă. Distribuie linkul tău pentru a începe să acumulezi.'
                : 'Niciun rând nu se potrivește filtrelor. Resetează filtrele pentru a vedea tot istoricul.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-2 text-left font-medium">Perioadă</th>
                  <th className="px-4 py-2 text-left font-medium">Tip</th>
                  <th className="px-4 py-2 text-right font-medium">Comenzi</th>
                  <th className="px-4 py-2 text-right font-medium">Valoare</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-left font-medium">Plătit la</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.map((r) => {
                  const t = r.commission_type ?? '';
                  const tTone = TYPE_TONE[t] ?? 'bg-zinc-100 text-zinc-600 ring-zinc-200';
                  const sTone = STATUS_TONE[r.status] ?? 'bg-zinc-100 text-zinc-600';
                  return (
                    <tr key={r.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3 text-zinc-700">
                        {fmtDate(r.period_start)} — {fmtDate(r.period_end)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tTone}`}
                        >
                          {TYPE_LABEL[t] ?? t ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-zinc-600">
                        {r.order_count}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-zinc-900">
                        {centsToRon(r.amount_cents)} RON
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${sTone}`}
                        >
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {r.paid_at ? fmtDate(r.paid_at) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-zinc-400">
        Pentru întrebări legate de plată, scrie-ne la{' '}
        <a className="text-purple-700 hover:underline" href="mailto:contact@hiraisolutions.ro">
          contact@hiraisolutions.ro
        </a>
        .
      </p>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub: string;
  tone?: 'default' | 'emerald' | 'amber';
}) {
  const toneCls =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : 'text-zinc-900';
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneCls}`}>{value}</p>
      <p className="mt-0.5 text-xs text-zinc-400">{sub}</p>
    </div>
  );
}
