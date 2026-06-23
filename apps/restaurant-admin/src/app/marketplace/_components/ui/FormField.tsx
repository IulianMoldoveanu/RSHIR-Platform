// B2B Marketplace (admin / light) — form field wrapper (spec §1.13, §2.10).
//
// label (micro-label) + control (children, verbatim) + optional helper
// (wired via aria-describedby) + optional inline error (role=alert). Exports
// INPUT_CLS / SELECT_CLS / TEXTAREA_CLS with the brand-mov focus ring so the
// form swaps `focus:ring-purple-600` → brand in one place.
//
// The control's name/id/required/value attributes are the caller's
// responsibility (passed as children) — this wrapper never touches them.

import * as React from 'react';
import { cn } from '@hir/ui';

const FOCUS = 'focus:border-[#6b1f8a] focus:outline-none focus:ring-1 focus:ring-[#6b1f8a]';

export const INPUT_CLS = cn(
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition',
  FOCUS,
);

export const SELECT_CLS = cn(
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition',
  FOCUS,
);

export const TEXTAREA_CLS = cn(
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition',
  FOCUS,
);

const COL_SPAN: Record<1 | 2 | 3, string> = {
  1: '',
  2: 'sm:col-span-2',
  3: 'sm:col-span-3',
};

export interface FormFieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  helper?: string;
  error?: string;
  colSpan?: 1 | 2 | 3;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  htmlFor,
  required = false,
  helper,
  error,
  colSpan = 1,
  children,
  className,
}: FormFieldProps): JSX.Element {
  const helperId = helper ? `${htmlFor}-helper` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  return (
    <div className={cn('space-y-1.5', COL_SPAN[colSpan], className)}>
      <label
        htmlFor={htmlFor}
        className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
      >
        {label}
        {required ? <span className="ml-1 text-rose-600">*</span> : null}
      </label>
      {children}
      {helper && !error ? (
        <p id={helperId} className="text-xs text-slate-500">
          {helper}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" aria-live="polite" className="text-xs font-medium text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
