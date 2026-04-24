import * as React from 'react';
import { cn } from '../../lib/cn';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  hint?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({
  title,
  description,
  hint,
  icon,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 p-8 text-center',
        className,
      )}
      {...props}
    >
      {icon ? <div className="mb-3 text-zinc-400">{icon}</div> : null}
      <p className="text-sm font-semibold text-zinc-800">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-zinc-500">{description}</p> : null}
      {hint ? <p className="mt-2 max-w-md text-xs text-zinc-400">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
