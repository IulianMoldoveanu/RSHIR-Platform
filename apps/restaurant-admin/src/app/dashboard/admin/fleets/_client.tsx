'use client';

import { useState, useTransition } from 'react';
import { updateFleetControls, type FleetControls } from './actions';

export type FleetVM = {
  id: string;
  name: string;
  slug: string;
  tier: string | null;
  allowedVerticals: string[];
  isActive: boolean;
  displayPrefix: string | null;
  canValidateCouriers: boolean;
  kycRequired: boolean;
  kyfRequired: boolean;
  courierTotal: number;
  courierActive: number;
  kyfStatus: string | null;
};

const VERTICAL_EMOJI: Record<string, string> = { restaurant: '🍕', pharma: '💊' };

export function FleetsClient({ fleets }: { fleets: FleetVM[] }) {
  if (fleets.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 px-4 py-6 text-center text-sm text-slate-500">
        Nicio flotă încă.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {fleets.map((f) => (
        <FleetRow key={f.id} fleet={f} />
      ))}
    </div>
  );
}

function FleetRow({ fleet }: { fleet: FleetVM }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(0);
  const [prefix, setPrefix] = useState(fleet.displayPrefix ?? '');
  const [canValidate, setCanValidate] = useState(fleet.canValidateCouriers);
  const [kycRequired, setKycRequired] = useState(fleet.kycRequired);
  const [kyfRequired, setKyfRequired] = useState(fleet.kyfRequired);
  const [isActive, setIsActive] = useState(fleet.isActive);

  function save(controls: FleetControls) {
    setError(null);
    start(async () => {
      const r = await updateFleetControls(fleet.id, controls);
      if (r.ok) setSavedAt(savedAt + 1);
      else setError(r.error);
    });
  }

  const kyfBadge =
    fleet.kyfStatus === 'VERIFIED'
      ? { label: 'KYF ✓', tone: 'bg-emerald-500/10 text-emerald-300' }
      : fleet.kyfStatus === 'PENDING'
        ? { label: 'KYF în curs', tone: 'bg-violet-500/10 text-violet-300' }
        : fleet.kyfStatus === 'REJECTED'
          ? { label: 'KYF respins', tone: 'bg-rose-500/10 text-rose-300' }
          : { label: 'KYF —', tone: 'bg-slate-800 text-slate-500' };

  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            {fleet.name}
            <span className="font-mono text-[11px] font-normal text-slate-500">{fleet.slug}</span>
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase">{fleet.tier ?? 'partner'}</span>
            {fleet.allowedVerticals.map((v) => (
              <span key={v} title={v}>
                {VERTICAL_EMOJI[v] ?? v}
              </span>
            ))}
            <span>· {fleet.courierActive}/{fleet.courierTotal} curieri activi</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${kyfBadge.tone}`}>{kyfBadge.label}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pending ? (
            <span className="text-[11px] text-slate-500">salvez…</span>
          ) : savedAt > 0 && !error ? (
            <span className="text-[11px] text-emerald-400">salvat ✓</span>
          ) : null}
          {error ? <span className="max-w-[180px] truncate text-[11px] text-rose-400">{error}</span> : null}
          <ToggleChip
            label="Activă"
            checked={isActive}
            onChange={(v) => {
              setIsActive(v);
              save({ is_active: v });
            }}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-slate-400">Prefix afișat</span>
          <input
            value={prefix}
            maxLength={8}
            onChange={(e) => setPrefix(e.target.value.toUpperCase())}
            onBlur={() => {
              if ((prefix.trim() || null) !== (fleet.displayPrefix ?? null)) {
                save({ display_prefix: prefix });
              }
            }}
            placeholder="HIR"
            className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm uppercase text-slate-100 placeholder:text-slate-600 focus:border-violet-500 focus:outline-none"
          />
        </label>
        <CheckCard
          label="Flota validează curierii"
          hint="Își asumă răspunderea datelor"
          checked={canValidate}
          onChange={(v) => {
            setCanValidate(v);
            save({ can_validate_couriers: v });
          }}
        />
        <CheckCard
          label="Impune KYC curieri"
          hint="Doar curieri verificați"
          checked={kycRequired}
          onChange={(v) => {
            setKycRequired(v);
            save({ kyc_required: v });
          }}
        />
        <CheckCard
          label="Impune KYF firmă"
          hint="Operează doar dacă KYF verificat"
          checked={kyfRequired}
          onChange={(v) => {
            setKyfRequired(v);
            save({ kyf_required: v });
          }}
        />
      </div>
    </article>
  );
}

function ToggleChip({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
        checked ? 'bg-emerald-600 text-white' : 'border border-slate-700 bg-slate-900 text-slate-400'
      }`}
    >
      {checked ? label : `${label} off`}
    </button>
  );
}

function CheckCard({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-violet-500"
      />
      <span>
        <span className="block text-xs font-medium text-slate-200">{label}</span>
        <span className="block text-[10px] text-slate-500">{hint}</span>
      </span>
    </label>
  );
}
