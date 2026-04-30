import Link from 'next/link';

type Action = {
  label: string;
  href?: string;
  onClick?: () => void;
};

type Props = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: Action;
  children?: React.ReactNode;
};

/**
 * Shared empty-state shell used across all storefront surfaces.
 * Soft purple-50 background, dashed border, centered content.
 */
export function EmptyState({ icon, title, description, action, children }: Props) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-purple-200 bg-purple-50 px-6 py-12 text-center">
      {icon && (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-purple-100">
          {icon}
        </div>
      )}
      <div className="space-y-1.5">
        <p className="text-base font-semibold text-zinc-900">{title}</p>
        {description && (
          <p className="max-w-xs text-sm leading-relaxed text-zinc-500">{description}</p>
        )}
      </div>
      {children}
      {action && (
        action.href ? (
          <Link
            href={action.href}
            className="inline-flex h-10 items-center rounded-full bg-purple-700 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-800"
          >
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="inline-flex h-10 items-center rounded-full bg-purple-700 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-800"
          >
            {action.label}
          </button>
        )
      )}
    </div>
  );
}
