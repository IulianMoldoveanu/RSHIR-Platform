import { TrendingUp, Clock, Coins } from 'lucide-react';
import { Card } from '@/components/card';

type Props = {
  // Trailing-7-day DELIVERED rows (any shift), with updated_at + delivery_fee.
  trailing7Rows: Array<{ delivery_fee_ron: number | null; updated_at: string }>;
};

/**
 * Predicție venit per tură de 4h, defalcat pe interval orar (10-22).
 * Curierul vede răspunsul la întrebarea "dacă lucrez vineri 18-22 cât fac?".
 *
 * Algoritm simplu: medie pe oră din ultimele 7 zile, înmulțit cu durata
 * intervalului. Insuficient pentru zile lipsă, dar mult mai util decât
 * "media zilnică" generică. Când avem date pe ≥30 zile, se poate sofistica.
 */
const SHIFT_BUCKETS: Array<{ label: string; start: number; end: number }> = [
  { label: 'Prânz', start: 11, end: 14 },
  { label: 'După-amiază', start: 14, end: 18 },
  { label: 'Cina (prime time)', start: 18, end: 22 },
];

export function ShiftProjectionCard({ trailing7Rows }: Props) {
  // Bucket sums + counts per hour-of-day across the 7-day window.
  const hourSum = new Array<number>(24).fill(0);
  const hourCount = new Array<number>(24).fill(0);
  const daySeen = new Set<string>();
  for (const r of trailing7Rows) {
    const d = new Date(r.updated_at);
    const h = d.getHours();
    hourSum[h] += Number(r.delivery_fee_ron ?? 0);
    hourCount[h] += 1;
    daySeen.add(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    );
  }
  const daysObserved = Math.max(daySeen.size, 1);

  // Average per-hour earnings across days the courier actually worked
  // (not divided by 7 — that would penalise days off).
  const avgEarningsPerHour = (h: number) => hourSum[h] / daysObserved;

  const projections = SHIFT_BUCKETS.map((b) => {
    let total = 0;
    let coverage = 0;
    for (let h = b.start; h < b.end; h++) {
      total += avgEarningsPerHour(h);
      if (hourCount[h] > 0) coverage += 1;
    }
    const durationH = b.end - b.start;
    return {
      ...b,
      projectedEarnings: total,
      coverage,
      durationH,
    };
  });

  const hasData = daysObserved >= 2 && trailing7Rows.length >= 5;

  return (
    <Card>
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/30">
          <TrendingUp className="h-5 w-5 text-emerald-300" aria-hidden strokeWidth={2.25} />
        </span>
        <div className="flex flex-col">
          <h3 className="text-sm font-semibold text-hir-fg">Predicție tură</h3>
          <p className="mt-0.5 text-xs text-hir-muted-fg">
            Cât poți face într-o tură de 3-4 ore, bazat pe ultimele 7 zile lucrate.
          </p>
        </div>
      </header>

      {!hasData ? (
        <p className="mt-4 rounded-lg bg-hir-border/40 p-3 text-xs text-hir-muted-fg">
          Mai avem nevoie de cel puțin 2 zile lucrate și 5 livrări ca să-ți dăm
          o predicție de încredere. Continuă să lucrezi câteva ture și se va popula automat.
        </p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2">
          {projections.map((p) => {
            const confidence = p.coverage / p.durationH; // 0..1
            const confidenceLabel =
              confidence >= 0.75 ? 'Sigur' : confidence >= 0.5 ? 'Probabil' : 'Estimare';
            return (
              <li
                key={p.label}
                className="flex items-center justify-between rounded-lg border border-hir-border bg-hir-surface px-3 py-2.5"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold text-hir-fg">{p.label}</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-hir-muted-fg">
                    <Clock className="h-3 w-3" aria-hidden />
                    {p.start}:00 → {p.end}:00 · {confidenceLabel}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1 ring-1 ring-inset ring-emerald-500/30">
                  <Coins className="h-3.5 w-3.5 text-emerald-300" aria-hidden />
                  <span className="text-sm font-bold tabular-nums text-emerald-200">
                    ~{p.projectedEarnings.toFixed(0)} RON
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-hir-muted-fg">
        Calculul folosește media ta din ultimele 7 zile pe fiecare interval orar.
        Nu garanție — depinde de cerere și combo-uri.
      </p>
    </Card>
  );
}
