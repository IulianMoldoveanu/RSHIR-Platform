import type { ReactNode, HTMLAttributes } from 'react';

// The Card primitive — collapses ~90 inline copies of
// `rounded-2xl border border-hir-border bg-hir-surface ...` into a
// single styled wrapper. Variants cover the 3 cases the app actually
// uses:
//
//   default   - the standard panel (settings rows, info cards)
//   accent    - violet-tinted, calls attention without screaming
//   warning   - amber-tinted, expiring docs / battery warnings
//   danger    - rose-tinted, errors / SOS confirms / cancelled states
//
// Padding defaults to p-4 (matches existing density). Pass
// `padding="sm"` for compact cards (settings list rows) or
// `padding="lg"` for the hero cards on the day-summary page.
//
// Spreads remaining props so callers can still attach `aria-*`, `role`,
// `id`, etc. The element is a `<div>` by default — pass `asChild` is
// NOT supported; if you need a link/button card, compose with the
// className output via `cardClasses()` below.

export type CardVariant = 'default' | 'accent' | 'warning' | 'danger';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

const VARIANT_CLASSES: Record<CardVariant, string> = {
  default: 'border-hir-border bg-hir-surface',
  accent: 'border-violet-500/40 bg-violet-500/10',
  warning: 'border-amber-500/40 bg-amber-500/10',
  danger: 'border-rose-500/40 bg-rose-500/10',
};

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

export function cardClasses({
  variant = 'default',
  padding = 'md',
  className = '',
}: {
  variant?: CardVariant;
  padding?: CardPadding;
  className?: string;
} = {}): string {
  return `rounded-2xl border ${VARIANT_CLASSES[variant]} ${PADDING_CLASSES[padding]} ${className}`.trim();
}

type Props = HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
  padding?: CardPadding;
  children?: ReactNode;
};

export function Card({
  variant = 'default',
  padding = 'md',
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <div className={cardClasses({ variant, padding, className })} {...rest}>
      {children}
    </div>
  );
}
