import { Calculator, TrendingUp, Wallet } from 'lucide-react';
import { Card } from '@/components/card';
import { TipEditor } from './_tip-editor';

// Configurable: % retained for taxes/contributions (PFA estimate).
// Curierul vede asta în UI ca să nu fie surprins de obligațiile fiscale.
// Editable per-courier in a follow-up (settings.taxes_reserved_pct).
const TAX_RESERVE_PCT = 10;

type DeliveryRow = {
  id: string;
  delivery_fee_ron: number | null;
  updated_at: string;
  customer_first_name: string | null;
  dropoff_line1: string | null;
};

type TipRow = {
  delivery_id: string;
  amount_ron: number;
};

type Props = {
  // DELIVERED orders for the active window (today / week / month).
  deliveries: DeliveryRow[];
  // Tip rows scoped to the same set of delivery IDs.
  tips: TipRow[];
  // Label shown above the totals (e.g. "Azi", "Săpt.", "Luna").
  windowLabel: string;
};

export function CalculatorCard({ deliveries, tips, windowLabel }: Props) {
  const tipByDelivery = new Map(tips.map((t) => [t.delivery_id, Number(t.amount_ron)]));

  const brut = deliveries.reduce(
    (sum, d) => sum + (d.delivery_fee_ron != null ? Number(d.delivery_fee_ron) : 0),
    0,
  );
  const bacsis = deliveries.reduce(
    (sum, d) => sum + (tipByDelivery.get(d.id) ?? 0),
    0,
  );
  const grossWithTips = brut + bacsis;
  // Net reserve: rough PFA contribution estimate. Curierul ar trebui să
  // pună deoparte ~10% pentru taxe/contribuții (CAS/CASS rezidual + impozit
  // pe venit din activități independente). Configurabil ulterior.
  const taxReserve = Math.round(brut * (TAX_RESERVE_PCT / 100) * 100) / 100;
  const net = grossWithTips - taxReserve;

  return (
    <Card>
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-500/30">
          <Calculator className="h-5 w-5 text-violet-300" aria-hidden strokeWidth={2.25} />
        </span>
        <div className="flex flex-col">
          <h3 className="text-sm font-semibold text-hir-fg">Calculator câștiguri</h3>
          <p className="mt-0.5 text-xs text-hir-muted-fg">
            Brut · Bacșiș · Net pentru {windowLabel.toLowerCase()}.
          </p>
        </div>
      </header>

      {/* ── Three big numbers ─────────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat
          label="Brut"
          value={brut}
          tone="violet"
          hint="Sumă livrări"
        />
        <Stat
          label="Bacșiș"
          value={bacsis}
          tone="emerald"
          hint={`${tips.length} înreg.`}
        />
        <Stat
          label="Net estimat"
          value={net}
          tone="amber"
          hint={`−${TAX_RESERVE_PCT}% rezervă taxe`}
        />
      </div>

      {/* ── Total real ────────────────────────────────────────────────── */}
      <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-500/10 px-3 py-2 ring-1 ring-inset ring-emerald-500/20">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-emerald-300" aria-hidden />
          <span className="text-xs font-medium text-emerald-200">
            Total în mână ({windowLabel.toLowerCase()})
          </span>
        </div>
        <span className="text-base font-bold tabular-nums text-emerald-200">
          {grossWithTips.toFixed(2)} RON
        </span>
      </div>

      {/* ── Per-delivery breakdown ───────────────────────────────────── */}
      {deliveries.length === 0 ? (
        <p className="mt-4 text-xs text-hir-muted-fg">
          Nicio livrare în {windowLabel.toLowerCase()}.
        </p>
      ) : (
        <ol className="mt-4 flex flex-col gap-2 text-xs">
          <li className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-hir-muted-fg">
            <TrendingUp className="h-3 w-3" aria-hidden />
            Defalcare per comandă
          </li>
          {deliveries.slice(0, 10).map((d) => {
            const fee = d.delivery_fee_ron != null ? Number(d.delivery_fee_ron) : 0;
            const tip = tipByDelivery.get(d.id) ?? 0;
            return (
              <li
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-hir-border bg-hir-surface/50 px-2.5 py-2"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-hir-fg">
                    {d.customer_first_name ?? 'Client'}
                  </span>
                  <span className="truncate text-[11px] text-hir-muted-fg">
                    {d.dropoff_line1 ?? '—'}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums text-hir-fg">{fee.toFixed(2)} RON</span>
                  <TipEditor deliveryId={d.id} initialTip={tip} />
                </div>
              </li>
            );
          })}
          {deliveries.length > 10 ? (
            <li className="text-center text-[11px] text-hir-muted-fg">
              + încă {deliveries.length - 10} livrări
            </li>
          ) : null}
        </ol>
      )}
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: 'violet' | 'emerald' | 'amber';
  hint?: string;
}) {
  const toneClass =
    tone === 'violet'
      ? 'text-violet-200 ring-violet-500/20 bg-violet-500/10'
      : tone === 'emerald'
        ? 'text-emerald-200 ring-emerald-500/20 bg-emerald-500/10'
        : 'text-amber-200 ring-amber-500/20 bg-amber-500/10';
  return (
    <div className={`rounded-lg px-2.5 py-2 ring-1 ring-inset ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">
        {value.toFixed(2)}
        <span className="ml-0.5 text-[10px] font-medium opacity-80">RON</span>
      </p>
      {hint ? <p className="text-[10px] opacity-60">{hint}</p> : null}
    </div>
  );
}
