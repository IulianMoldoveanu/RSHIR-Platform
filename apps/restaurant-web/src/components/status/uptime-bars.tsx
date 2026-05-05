import type { DailyUptime } from '@/app/status/data';

// Color a single day bucket based on uptime ratio.
//   - null / no pings  → zinc-200 (we never recorded a probe that day)
//   - >= 99.9%         → emerald-500
//   - >= 95%           → amber-400
//   - else             → rose-500
function tone(d: DailyUptime): { fill: string; tooltip: string } {
  if (d.uptime == null || d.total === 0) {
    return { fill: 'bg-zinc-200', tooltip: `${d.day}: fără date` };
  }
  const pct = (d.uptime * 100).toFixed(2);
  if (d.uptime >= 0.999) return { fill: 'bg-emerald-500', tooltip: `${d.day}: ${pct}%` };
  if (d.uptime >= 0.95) return { fill: 'bg-amber-400', tooltip: `${d.day}: ${pct}%` };
  return { fill: 'bg-rose-500', tooltip: `${d.day}: ${pct}%` };
}

function aggregate(buckets: DailyUptime[]): string {
  let total = 0;
  let failed = 0;
  for (const b of buckets) {
    total += b.total;
    failed += b.failed;
  }
  if (total === 0) return '—';
  const ratio = (total - failed) / total;
  return `${(ratio * 100).toFixed(2)}%`;
}

export function UptimeBars({
  label,
  buckets,
}: {
  label: string;
  buckets: DailyUptime[];
}) {
  const summary = aggregate(buckets);
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-[#0F172A]">{label}</h3>
        <span className="text-xs text-[#64748B]">
          ultimele 90 zile · <span className="font-semibold text-[#0F172A]">{summary}</span>
        </span>
      </div>
      <div className="mt-3 flex items-end gap-[2px]" aria-label={`Uptime 90 zile pentru ${label}`}>
        {buckets.map((b) => {
          const { fill, tooltip } = tone(b);
          return (
            <span
              key={b.day}
              title={tooltip}
              className={`block h-8 flex-1 min-w-[2px] rounded-sm ${fill}`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-[#94A3B8]">
        <span>{buckets[0]?.day}</span>
        <span>azi</span>
      </div>
    </div>
  );
}
