import { TrendingUp } from 'lucide-react';

type Row = { delivery_fee_ron: number | null; updated_at: string };

const DAY_LABELS = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'] as const;

/**
 * 7-day earnings sparkline. Server-rendered as a static SVG so it pays no
 * client JS cost. Bars (not lines) so missing days read clearly as gaps
 * rather than spurious dips.
 *
 * Input: same `last30` trailing window already fetched by the earnings page.
 * We aggregate per local calendar day, take the last 7 columns ending
 * with today's bucket (rightmost) and label them with day-of-week shorts.
 *
 * Bars are coloured violet by default; the tallest day gets the brand
 * accent so the courier sees their best day at a glance.
 */
export function Sparkline7d({ rows, now = new Date() }: { rows: Row[]; now?: Date }) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // Build 7 day buckets ending with today.
  const buckets: { date: Date; total: number; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.push({ date: d, total: 0, count: 0 });
  }

  for (const r of rows) {
    const ts = new Date(r.updated_at);
    ts.setHours(0, 0, 0, 0);
    const ms = ts.getTime();
    const bucket = buckets.find((b) => b.date.getTime() === ms);
    if (!bucket) continue;
    bucket.total += Number(r.delivery_fee_ron) || 0;
    bucket.count += 1;
  }

  const maxTotal = Math.max(...buckets.map((b) => b.total), 1);
  const weekTotal = buckets.reduce((s, b) => s + b.total, 0);

  // SVG geometry. Compact — single row, 7 bars + day labels under each.
  const W = 280;
  const H = 80;
  const barAreaH = 52;
  const barAreaTop = 6;
  const labelY = H - 6;
  const colW = W / 7;
  const barW = colW * 0.55;

  return (
    <section
      aria-label="Câștigul ultimei săptămâni"
      className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-sm ring-1 ring-inset ring-hir-border/40"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-violet-300" aria-hidden strokeWidth={2.25} />
          <p className="text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
            Ultimele 7 zile
          </p>
        </div>
        <p className="text-sm font-semibold tabular-nums text-zinc-100">
          {weekTotal.toFixed(2)} RON
        </p>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={`Sparkline câștiguri ultimele 7 zile. Total: ${weekTotal.toFixed(2)} RON.`}
        className="block"
      >
        {/* Zero baseline */}
        <line
          x1={0}
          y1={barAreaTop + barAreaH}
          x2={W}
          y2={barAreaTop + barAreaH}
          stroke="#27272a"
          strokeWidth={1}
        />
        {buckets.map((b, i) => {
          const h = Math.round((b.total / maxTotal) * barAreaH);
          const x = i * colW + (colW - barW) / 2;
          const y = barAreaTop + barAreaH - h;
          const isMax = b.total > 0 && b.total === maxTotal;
          const fill = b.total === 0 ? '#3f3f46' : isMax ? '#a78bfa' : '#7c3aed';
          const dayIdx = (b.date.getDay() + 6) % 7;
          const isToday = i === 6;
          const labelColor = isToday ? '#c4b5fd' : '#71717a';
          return (
            <g key={i}>
              {/* Bar with subtle rounded top */}
              <rect
                x={x}
                y={y}
                width={barW}
                height={h || 1}
                rx={Math.min(3, barW / 2)}
                fill={fill}
              >
                <title>
                  {`${DAY_LABELS[dayIdx]} ${String(b.date.getDate()).padStart(2, '0')}.${String(b.date.getMonth() + 1).padStart(2, '0')}: ${b.total.toFixed(2)} RON · ${b.count} livrări`}
                </title>
              </rect>
              {/* Today gets a small dot under its bar so it stands out */}
              {isToday ? (
                <circle
                  cx={x + barW / 2}
                  cy={barAreaTop + barAreaH + 4}
                  r={1.5}
                  fill="#a78bfa"
                />
              ) : null}
              <text
                x={x + barW / 2}
                y={labelY}
                textAnchor="middle"
                fontSize="9"
                fontWeight={isToday ? 700 : 500}
                fill={labelColor}
              >
                {DAY_LABELS[dayIdx]}
              </text>
            </g>
          );
        })}
      </svg>

      {weekTotal === 0 ? (
        <p className="mt-2 text-[11px] text-zinc-500">
          Nicio livrare în ultimele 7 zile.
        </p>
      ) : null}
    </section>
  );
}
