'use client';

import { ErrorCard } from '@/components/error-card';

export default function HistoryError({
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
      scope="history"
      title="Istoricul nu s-a putut încărca"
      hint="Reîncearcă. Comenzile vechi sunt arhivate și se pot încărca mai lent decât lista curentă."
    />
  );
}
