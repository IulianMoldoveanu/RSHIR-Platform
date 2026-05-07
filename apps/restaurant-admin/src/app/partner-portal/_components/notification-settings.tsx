'use client';

// PR3 — partner notification preferences. Three opt-in toggles persisted on
// partners.notification_settings (jsonb). Reads pre-hydrated server-side
// defaults; saves via the updatePartnerNotificationSettings server action.
// The 4th key (on_commission_paid) is pinned ON server-side until a UI ships.

import { useState, useTransition } from 'react';
import { updatePartnerNotificationSettings } from '../actions';

type Props = {
  initial: {
    on_application_approved: boolean;
    on_tenant_went_live: boolean;
    on_tenant_churned: boolean;
  };
};

export function NotificationSettings({ initial }: Props) {
  const [vals, setVals] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const set = <K extends keyof typeof vals>(k: K, v: boolean) =>
    setVals((s) => ({ ...s, [k]: v }));

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await updatePartnerNotificationSettings(vals);
      if (res.ok) setMsg({ kind: 'ok', text: 'Preferințele au fost salvate.' });
      else setMsg({ kind: 'err', text: res.error });
    });
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <p className="mb-4 text-xs text-zinc-500">
        Vă trimitem un e-mail doar pentru evenimentele bifate mai jos.
      </p>
      <div className="flex flex-col gap-3">
        <Toggle
          label="Cerere aprobată"
          description="Confirmăm că aplicația dumneavoastră de partener a fost aprobată."
          checked={vals.on_application_approved}
          onChange={(v) => set('on_application_approved', v)}
        />
        <Toggle
          label="Restaurant LIVE"
          description="Restaurantul recomandat are prima comandă livrată — comision activ."
          checked={vals.on_tenant_went_live}
          onChange={(v) => set('on_tenant_went_live', v)}
        />
        <Toggle
          label="Restaurant încheiat"
          description="Restaurantul recomandat a încheiat colaborarea cu HIR."
          checked={vals.on_tenant_churned}
          onChange={(v) => set('on_tenant_churned', v)}
        />
      </div>
      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60"
        >
          {pending ? 'Se salvează…' : 'Salvează preferințele'}
        </button>
        {msg ? (
          <span
            className={`text-xs ${msg.kind === 'ok' ? 'text-emerald-700' : 'text-rose-700'}`}
            role="status"
          >
            {msg.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-md border border-zinc-100 p-3 hover:border-zinc-200">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-zinc-900">{label}</span>
        <span className="mt-0.5 block text-xs text-zinc-500">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        className="mt-1 h-4 w-4 flex-none accent-purple-600"
      />
    </label>
  );
}
