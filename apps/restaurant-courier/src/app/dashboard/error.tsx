'use client';

import { ErrorCard } from '@/components/error-card';

// Dashboard route group error boundary. Catches any uncaught throw in a child
// page (orders / earnings / settings / shift / orders/[id]) so the courier
// sees a recoverable card instead of a blank screen on the road. Segment-
// level boundaries (orders/[id]/error.tsx, earnings/error.tsx, etc.) handle
// their own subtrees first; this is the catch-all for everything else.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorCard error={error} reset={reset} scope="dashboard" />;
}
