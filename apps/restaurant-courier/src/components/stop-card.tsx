import type { ReactNode } from 'react';

// Shared primitive for the pickup + dropoff sections on the order
// detail page. Same shape (numbered chip + ALL-CAPS label + address +
// optional subtitle + actions row), only the accent tone differs.
//
// Visual:
//   - 3px left accent bar (violet for pickup, emerald for dropoff)
//     mirrors the route dot color on the order list cards so the
//     courier learns the convention everywhere in the app
//   - h-7 numbered chip with tinted bg/text matching the tone
//   - Address: text-base font-semibold (prime info)
//   - Subtitle (optional): text-sm muted (customer name on dropoff)
//   - Actions: rendered as children below the address

type Tone = 'pickup' | 'dropoff';

const TONE = {
  pickup: {
    accentBg: 'bg-violet-500',
    chipBg: 'bg-violet-500/20',
    chipText: 'text-violet-300',
    label: 'text-violet-400',
    border: 'border-violet-500/20',
  },
  dropoff: {
    accentBg: 'bg-emerald-500',
    chipBg: 'bg-emerald-500/20',
    chipText: 'text-emerald-300',
    label: 'text-emerald-400',
    border: 'border-emerald-500/20',
  },
} as const satisfies Record<Tone, Record<string, string>>;

export function StopCard({
  tone,
  step,
  label,
  address,
  subtitle,
  children,
}: {
  tone: Tone;
  step: 1 | 2;
  label: string;
  address: string | null;
  subtitle?: string | null;
  children?: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <section
      className={`relative overflow-hidden rounded-2xl border ${t.border} bg-hir-surface p-5`}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${t.accentBg}`} />
      <div className="flex items-center gap-2">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${t.chipBg} ${t.chipText}`}
        >
          {step}
        </span>
        <p
          className={`text-[11px] font-semibold uppercase tracking-wide ${t.label}`}
        >
          {label}
        </p>
      </div>
      <p className="mt-2 text-base font-semibold leading-tight text-hir-fg">
        {address ?? '—'}
      </p>
      {subtitle ? (
        <p className="mt-1 text-sm text-hir-muted-fg">{subtitle}</p>
      ) : null}
      {children ? <div className="mt-3 flex flex-wrap gap-2">{children}</div> : null}
    </section>
  );
}
