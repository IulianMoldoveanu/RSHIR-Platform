import * as React from 'react';
import { cn } from '../../lib/cn';

// Loading-state placeholder. Two layers of motion:
// 1. animate-pulse — gentle opacity oscillation (always on, respected
//    by Tailwind's prefers-reduced-motion behaviour).
// 2. animate-shimmer — linear-gradient overlay slides across at 200%
//    width, giving a subtle shine. Visible motion (slightly faster on
//    OLED). Disabled automatically under prefers-reduced-motion via
//    the motion-reduce: variant.
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-zinc-100 animate-pulse',
        'before:absolute before:inset-0 before:-translate-x-full before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent before:animate-shimmer motion-reduce:before:animate-none',
        className,
      )}
      {...props}
    />
  );
}
