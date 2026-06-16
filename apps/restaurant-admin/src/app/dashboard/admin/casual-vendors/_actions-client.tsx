'use client';

// Client-side action buttons for /dashboard/admin/casual-vendors.
// Mirrors the useTransition + router.refresh pattern already used for tenant
// suspend/restore and city activation.

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  approveCasualVendor,
  suspendCasualVendor,
  restoreCasualVendor,
} from './actions';

type Verb = 'approve' | 'suspend' | 'restore';

const LABEL: Record<Verb, { idle: string; pending: string }> = {
  approve: { idle: 'Aprobă', pending: 'Se aprobă…' },
  suspend: { idle: 'Suspendă', pending: 'Se suspendă…' },
  restore: { idle: 'Reactivează', pending: 'Se reactivează…' },
};

const STYLE: Record<Verb, string> = {
  approve: 'text-emerald-700 hover:bg-emerald-50',
  suspend: 'text-rose-700 hover:bg-rose-50',
  restore: 'text-emerald-700 hover:bg-emerald-50',
};

const CONFIRM: Record<Verb, (name: string) => string> = {
  approve: (n) => `Aprobă vendorul „${n}"? Va putea publica cereri imediat.`,
  suspend: (n) => `Suspendă vendorul „${n}"? Nu va mai putea publica.`,
  restore: (n) => `Reactivează vendorul „${n}"?`,
};

export function CasualVendorAction({
  verb,
  tenantId,
  tenantName,
}: {
  verb: Verb;
  tenantId: string;
  tenantName: string;
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick(): void {
    if (typeof window !== 'undefined' && !window.confirm(CONFIRM[verb](tenantName))) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const fn =
        verb === 'approve'
          ? approveCasualVendor
          : verb === 'suspend'
            ? suspendCasualVendor
            : restoreCasualVendor;
      const res = await fn({ tenantId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={
          'rounded-md border border-transparent px-2 py-1 text-xs font-medium transition disabled:opacity-50 ' +
          STYLE[verb]
        }
      >
        {pending ? LABEL[verb].pending : LABEL[verb].idle}
      </button>
      {error && <span className="text-[10px] text-rose-600">{error}</span>}
    </span>
  );
}
