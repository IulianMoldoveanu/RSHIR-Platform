'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@hir/ui';
import { cancelOrder, updateOrderStatus } from '../actions';
import type { OrderStatus } from '../status-machine';

const FORWARD_LABEL: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: 'Confirmă',
  PREPARING: 'Trece în preparare',
  READY: 'Marchează gata',
  DISPATCHED: 'Trimite',
  IN_DELIVERY: 'În livrare',
  DELIVERED: 'Marchează livrată',
};

export function StatusActions({
  orderId,
  current,
  nextOptions,
  cancellable,
  tenantId,
}: {
  orderId: string;
  current: OrderStatus;
  nextOptions: OrderStatus[];
  cancellable: boolean;
  tenantId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onForward = (next: OrderStatus) => {
    setError(null);
    startTransition(async () => {
      try {
        await updateOrderStatus(orderId, next, tenantId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Eroare necunoscută.');
      }
    });
  };

  const onCancel = () => {
    if (!confirm('Anulezi această comandă?')) return;
    const reason = prompt('Motiv (optional)') ?? undefined;
    setError(null);
    startTransition(async () => {
      try {
        await cancelOrder(orderId, tenantId, reason);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Eroare necunoscută.');
      }
    });
  };

  const forwardOptions = nextOptions.filter((s) => s !== 'CANCELLED');

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {forwardOptions.map((next) => (
          <Button
            key={next}
            size="sm"
            disabled={pending}
            onClick={() => onForward(next)}
          >
            {FORWARD_LABEL[next] ?? next}
          </Button>
        ))}
        {cancellable && (
          <Button
            variant="destructive"
            size="sm"
            disabled={pending}
            onClick={onCancel}
          >
            Anulează
          </Button>
        )}
        {forwardOptions.length === 0 && !cancellable && (
          <span className="text-xs text-zinc-500">Comanda este într-o stare finală ({current}).</span>
        )}
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
