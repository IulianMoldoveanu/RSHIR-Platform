import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cardClasses } from './card';

// Single-tap settings row used throughout /dashboard/settings. Same
// geometry as a `<Card>` but interactive (hover ring + active scale).
// Pass `href` for navigation (renders as Link), omit for an inert row.
//
// Variants:
//   default - hover violet ring, the standard nav row
//   danger  - hover rose ring, for Logout-style destructive rows
//
// Tap target ≥ 56px (WCAG 2.5.5) thanks to py-4 + 24px icon disc.
export function SettingsRow({
  href,
  icon,
  iconBg = 'bg-violet-500/10',
  label,
  description,
  trailing,
  variant = 'default',
  disabled = false,
}: {
  href?: string;
  icon: ReactNode;
  iconBg?: string;
  label: string;
  description?: string;
  trailing?: ReactNode;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}) {
  // Hover lift + tone-matched shadow + focus ring — same affordance the
  // rest of the polish wave uses for tappable cards (HelpDrawer items,
  // help-page support rows, messages page phone row).
  const hoverState =
    variant === 'danger'
      ? 'hover:border-rose-500/40 hover:bg-rose-500/5 hover:shadow-md hover:shadow-rose-500/10 focus-visible:outline-rose-500'
      : 'hover:border-violet-500/40 hover:bg-hir-border/60 hover:shadow-md hover:shadow-violet-500/10 focus-visible:outline-violet-500';
  const chevronHover =
    variant === 'danger'
      ? 'group-hover:translate-x-0.5 group-hover:text-rose-300'
      : 'group-hover:translate-x-0.5 group-hover:text-violet-300';
  const base = `group ${cardClasses({ padding: 'none' })} flex min-h-[56px] items-center gap-3 px-5 py-4 transition-all ${
    disabled
      ? 'opacity-50'
      : `${hoverState} hover:-translate-y-px active:translate-y-0 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2`
  }`;

  const content = (
    <>
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ring-hir-border/50 transition-colors ${iconBg} ${
          variant === 'danger'
            ? 'group-hover:ring-rose-500/30'
            : 'group-hover:ring-violet-500/30'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-hir-fg">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-hir-muted-fg">{description}</span>
        ) : null}
      </span>
      {trailing ??
        (href ? (
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-hir-muted-fg transition-transform ${chevronHover}`}
            aria-hidden
            strokeWidth={2.25}
          />
        ) : null)}
    </>
  );

  if (href && !disabled) {
    return (
      <Link href={href} className={base}>
        {content}
      </Link>
    );
  }

  return <div className={base}>{content}</div>;
}
