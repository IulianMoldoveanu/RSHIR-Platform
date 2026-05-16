'use client';

import { ErrorCard } from '@/components/error-card';

// Order-detail segment boundary. A failure here keeps the dashboard
// shell + bottom-nav alive so the rider can still navigate away
// (e.g. back to Comenzi). Without this, the parent dashboard error
// boundary would unmount the whole shell.
export default function OrderDetailError({
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
      scope="orders/[id]"
      title="Nu am putut încărca comanda"
      hint="Comanda poate fi indisponibilă temporar sau conexiunea ta este slabă. Reîncearcă sau întoarce-te la lista de comenzi."
    />
  );
}
