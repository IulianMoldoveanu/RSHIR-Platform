'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { AgentName } from '@/lib/ai/master-orchestrator-types';
import { toggleAutoPromoteEligible } from './actions';

type Props = {
  tenantId: string;
  agent: AgentName;
  category: string;
  initial: boolean;
  destructive: boolean;
  disabled?: boolean;
};

// OWNER opt-out for the F6 daily trust auto-promotion worker. Hidden
// entirely for destructive categories — they never auto-promote anyway,
// so a toggle would be misleading.
export function AutoPromoteToggle({
  tenantId,
  agent,
  category,
  initial,
  destructive,
  disabled,
}: Props) {
  const router = useRouter();
  const [eligible, setEligible] = useState<boolean>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (destructive) return null;

  const handleChange = (next: boolean) => {
    setEligible(next);
    setError(null);
    start(async () => {
      const r = await toggleAutoPromoteEligible(tenantId, {
        agent,
        category,
        eligible: next,
      });
      if (!r.ok) {
        setError(r.error);
        setEligible(initial);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <label className="mt-1 flex flex-none items-center gap-2 text-[11px] text-zinc-600">
      <input
        type="checkbox"
        checked={eligible}
        disabled={disabled || pending}
        onChange={(e) => handleChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-zinc-300 text-purple-600 focus:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <span>Promovare automată</span>
      {error && <span className="text-rose-700">({error})</span>}
    </label>
  );
}
