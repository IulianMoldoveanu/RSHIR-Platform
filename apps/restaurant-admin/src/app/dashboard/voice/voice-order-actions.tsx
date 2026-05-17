'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approveVoiceOrder, rejectVoiceOrder } from './actions';

export function VoiceOrderActions({
  orderId,
  tenantId,
}: {
  orderId: string;
  tenantId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const onApprove = () =>
    start(async () => {
      await approveVoiceOrder(orderId, tenantId);
      router.refresh();
    });

  const onReject = () =>
    start(async () => {
      await rejectVoiceOrder(orderId, tenantId);
      router.refresh();
    });

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={onApprove}
        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Se procesează…' : 'Confirmă comanda'}
      </button>
      <a
        href={`/dashboard/orders/${orderId}`}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Editează
      </a>
      <button
        type="button"
        disabled={pending}
        onClick={onReject}
        className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Respinge
      </button>
    </div>
  );
}
