// Single source of truth for rendering a courier_orders status pill.
//
// Before this component, three surfaces (rider list / rider detail /
// fleet dispatcher row) each rendered the same pill with different
// label maps and inconsistent tone palettes — including divergent
// labels for CREATED ("Liberă" rider / "Nouă" dispatcher) and a
// "violet for everything" header chip on the rider detail page.
//
// One component, one label map, one tone map. Consumers that need
// just the localized label can import STATUS_LABEL_RO directly to
// avoid pulling React into a server-only string lookup.

import type { ComponentType } from 'react';

export const STATUS_LABEL_RO: Record<string, string> = {
  CREATED: 'Liberă',
  OFFERED: 'Oferită',
  ACCEPTED: 'Acceptată',
  PICKED_UP: 'Ridicată',
  IN_TRANSIT: 'În livrare',
  DELIVERED: 'Livrată',
  CANCELLED: 'Anulată',
  FAILED: 'Eșuată',
};

// Tone-class lookup. Each tone uses the *-500/10 background + *-300
// text pattern that matches the rest of the dark theme. CREATED gets a
// neutral zinc because it's the "nothing happened yet" state; the
// in-flight states get a single sky color because by then the order's
// identity belongs to the courier carrying it, not the lifecycle stage.
const TONE_BY_STATUS: Record<string, string> = {
  CREATED: 'border-zinc-700 bg-zinc-950 text-zinc-400',
  OFFERED: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  ACCEPTED: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
  PICKED_UP: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  IN_TRANSIT: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  DELIVERED: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  CANCELLED: 'border-red-500/40 bg-red-500/10 text-red-300',
  FAILED: 'border-red-500/40 bg-red-500/10 text-red-300',
};

const FALLBACK_TONE = 'border-zinc-700 bg-zinc-900 text-zinc-300';

type Size = 'sm' | 'md';

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-1 text-[11px]',
};

export type OrderStatusBadgeProps = {
  status: string;
  size?: Size;
  className?: string;
};

export const OrderStatusBadge: ComponentType<OrderStatusBadgeProps> = ({
  status,
  size = 'sm',
  className,
}) => {
  const tone = TONE_BY_STATUS[status] ?? FALLBACK_TONE;
  const label = STATUS_LABEL_RO[status] ?? status;
  const sizing = SIZE_CLASSES[size];
  return (
    <span
      className={`shrink-0 rounded-full border font-semibold uppercase tracking-wide ${tone} ${sizing}${className ? ` ${className}` : ''}`}
    >
      {label}
    </span>
  );
};
