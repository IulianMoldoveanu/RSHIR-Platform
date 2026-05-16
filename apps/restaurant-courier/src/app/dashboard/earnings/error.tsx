'use client';

import { ErrorCard } from '@/components/error-card';

export default function EarningsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorCard
      error={error}
      reset={reset}
      scope="earnings"
      title="Câștigurile nu s-au putut încărca"
      hint="Reîncearcă în câteva secunde. Dacă persistă, contactează dispecerul tău."
    />
  );
}
