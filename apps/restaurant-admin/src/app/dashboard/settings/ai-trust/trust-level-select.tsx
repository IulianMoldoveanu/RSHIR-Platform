'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { TRUST_LEVEL_LABELS, type AgentName, type TrustLevel } from '@/lib/ai/master-orchestrator-types';
import { updateTrustLevel } from './actions';

type Props = {
  tenantId: string;
  agent: AgentName;
  category: string;
  initial: TrustLevel;
  destructive: boolean;
  disabled?: boolean;
};

export function TrustLevelSelect({ tenantId, agent, category, initial, destructive, disabled }: Props) {
  const router = useRouter();
  const [value, setValue] = useState<TrustLevel>(destructive ? 'PROPOSE_ONLY' : initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleChange = (next: TrustLevel) => {
    if (destructive && next !== 'PROPOSE_ONLY') return; // UI guard; backend re-validates
    setValue(next);
    setError(null);
    start(async () => {
      const r = await updateTrustLevel(tenantId, { agent, category, trustLevel: next });
      if (!r.ok) {
        setError(r.error);
        setValue(initial);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-none flex-col items-end gap-1">
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value as TrustLevel)}
        disabled={disabled || pending || destructive}
        className="min-w-[14rem] rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500"
      >
        <option value="PROPOSE_ONLY">{TRUST_LEVEL_LABELS.PROPOSE_ONLY}</option>
        <option value="AUTO_REVERSIBLE" disabled={destructive}>
          {TRUST_LEVEL_LABELS.AUTO_REVERSIBLE}
        </option>
        <option value="AUTO_FULL" disabled={destructive}>
          {TRUST_LEVEL_LABELS.AUTO_FULL}
        </option>
      </select>
      {error && <span className="text-[11px] text-rose-700">{error}</span>}
    </div>
  );
}
