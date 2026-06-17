// B2B Marketplace (admin / light) — button hierarchy (spec §1.12).
//
// `buttonClass(variant, size)` is the className recipe so client islands
// (OfferActions / CancelButton) can keep their own onClick/disabled/type
// wiring and just consume the classes. `<Button>` is the convenience
// wrapper for static server-rendered buttons; `<ButtonLink>` wraps a Next
// Link with the same recipe.
//
// primary = brand mov gradient (#6b1f8a → #8e3bb0). Brand literals are
// centralized here so a future token migration is one file.

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@hir/ui';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accept';
export type ButtonSize = 'sm' | 'md';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b1f8a] focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed';

const SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-br from-[#6b1f8a] to-[#8e3bb0] text-white shadow-[0_2px_8px_rgba(107,31,138,0.25)] hover:-translate-y-px',
  secondary: 'bg-white text-[#6b1f8a] ring-1 ring-[#e9d5f0] hover:bg-[#f7f0fb]',
  ghost: 'text-[#6b1f8a] hover:bg-[#f7f0fb]',
  danger: 'bg-white text-rose-700 ring-1 ring-rose-300 hover:bg-rose-50',
  accept: 'bg-emerald-600 text-white hover:bg-emerald-700',
};

export function buttonClass(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return cn(BASE, SIZE[size], VARIANT[variant], className);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: ButtonProps): JSX.Element {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />;
}

export interface ButtonLinkProps
  extends Omit<React.ComponentProps<typeof Link>, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: ButtonLinkProps): JSX.Element {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}
