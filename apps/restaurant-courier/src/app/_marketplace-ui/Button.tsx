// B2B Marketplace (courier dark theme) — Button + buttonClass() recipe.
//
// Implements the §1.12 button hierarchy on the dark surface. The
// `buttonClass(variant, size)` helper exists so client islands
// (OfferActions / WithdrawButton / BidForm submit) can reuse the exact
// recipe on their own `<button onClick>` without wrapping their logic — they
// keep their 'use client' + onClick/disabled/type wiring and only consume the
// className.

import * as React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accept';
export type ButtonSize = 'sm' | 'md';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed';

const SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

const VARIANT: Record<ButtonVariant, string> = {
  // Brand mov on dark = violet-500/400 + soft violet glow.
  primary:
    'bg-violet-500 text-white shadow-[0_2px_12px_rgba(139,92,246,0.3)] hover:bg-violet-400',
  secondary:
    'bg-hir-surface text-hir-fg ring-1 ring-inset ring-hir-border hover:bg-hir-border',
  ghost: 'text-violet-300 hover:text-violet-200 hover:bg-violet-500/10',
  danger:
    'bg-rose-500/10 text-rose-200 ring-1 ring-inset ring-rose-500/40 hover:bg-rose-500/20',
  accept: 'bg-emerald-600 text-white hover:bg-emerald-700',
};

export function buttonClass(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return [BASE, SIZE[size], VARIANT[variant], className ?? '']
    .filter(Boolean)
    .join(' ');
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type,
  children,
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button type={type ?? 'button'} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}
