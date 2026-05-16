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
  const hoverRing =
    variant === 'danger'
      ? 'hover:border-rose-500/40 hover:bg-rose-500/5'
      : 'hover:border-violet-500/40 hover:bg-hir-border/60';
  const base = `${cardClasses({ padding: 'none' })} flex min-h-[56px] items-center gap-3 px-5 py-4 ${
    disabled ? 'opacity-50' : `${hoverRing} active:scale-[0.99]`
  } transition-colors`;

  const content = (
    <>
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconBg}`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-hir-fg">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-hir-muted-fg">{description}</span>
        ) : null}
      </span>
      {trailing ?? (href ? <ChevronRight className="h-4 w-4 text-hir-muted-fg" aria-hidden /> : null)}
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
