import type { OverallStatus } from '@/app/status/data';

const COPY: Record<OverallStatus, { label: string; tone: string; dot: string; ring: string }> = {
  operational: {
    label: 'Toate sistemele funcționează',
    tone: 'bg-emerald-50 text-emerald-900',
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-200',
  },
  degraded: {
    label: 'Performanță redusă',
    tone: 'bg-amber-50 text-amber-900',
    dot: 'bg-amber-500',
    ring: 'ring-amber-200',
  },
  outage: {
    label: 'Întrerupere în curs',
    tone: 'bg-rose-50 text-rose-900',
    dot: 'bg-rose-500',
    ring: 'ring-rose-200',
  },
  unknown: {
    label: 'Status indisponibil',
    tone: 'bg-zinc-50 text-zinc-700',
    dot: 'bg-zinc-400',
    ring: 'ring-zinc-200',
  },
};

export function StatusBadge({ overall }: { overall: OverallStatus }) {
  const c = COPY[overall];
  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-4 py-3 ring-1 ring-inset ${c.tone} ${c.ring}`}
      role="status"
    >
      <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} aria-hidden />
      <span className="text-sm font-semibold sm:text-base">{c.label}</span>
    </div>
  );
}
