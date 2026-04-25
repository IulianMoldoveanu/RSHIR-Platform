'use client';

import { useState, useTransition } from 'react';
import { createPromoAction, updatePromoAction, type PromoKind } from './actions';
import type { PromoRow } from './promos-client';

type Props = {
  tenantId: string;
  editing?: PromoRow;
  onSaved: (row: PromoRow) => void;
  onCancel: () => void;
};

export function PromoForm({ tenantId, editing, onSaved, onCancel }: Props) {
  const [code, setCode] = useState(editing?.code ?? '');
  const [kind, setKind] = useState<PromoKind>(editing?.kind ?? 'PERCENT');
  const [valueInt, setValueInt] = useState<number>(editing?.value_int ?? 10);
  const [minOrderRon, setMinOrderRon] = useState<number>(editing?.min_order_ron ?? 0);
  const [maxUses, setMaxUses] = useState<string>(
    editing?.max_uses != null ? String(editing.max_uses) : '',
  );
  const [validFrom, setValidFrom] = useState<string>(toDateInput(editing?.valid_from));
  const [validUntil, setValidUntil] = useState<string>(toDateInput(editing?.valid_until));
  const [isActive, setIsActive] = useState<boolean>(editing?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = {
      code: code.trim().toUpperCase(),
      kind,
      valueInt: kind === 'FREE_DELIVERY' ? 0 : Number(valueInt),
      minOrderRon: Number(minOrderRon) || 0,
      maxUses: maxUses.trim() === '' ? null : Number(maxUses),
      validFrom: validFrom ? new Date(validFrom).toISOString() : null,
      validUntil: validUntil ? new Date(validUntil).toISOString() : null,
      isActive,
    };

    startTransition(async () => {
      const res = editing
        ? await updatePromoAction(editing.id, input, tenantId)
        : await createPromoAction(input, tenantId);
      if (!res.ok) {
        setError(errorLabel(res.error, res.detail));
        return;
      }
      // Reconstruct the row locally — server already validated and persisted.
      const id = editing ? editing.id : res.id!;
      onSaved({
        id,
        code: input.code,
        kind: input.kind,
        value_int: input.valueInt,
        min_order_ron: input.minOrderRon,
        max_uses: input.maxUses,
        used_count: editing?.used_count ?? 0,
        valid_from: input.validFrom,
        valid_until: input.validUntil,
        is_active: input.isActive,
        created_at: editing?.created_at ?? new Date().toISOString(),
      });
    });
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-md border border-zinc-200 bg-white p-4"
    >
      <h2 className="mb-3 text-sm font-semibold text-zinc-900">
        {editing ? `Editează ${editing.code}` : 'Cod nou'}
      </h2>

      {error && (
        <p role="alert" className="mb-3 rounded-md border border-rose-300 bg-rose-50 p-2 text-xs text-rose-800">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Cod (A-Z, 0-9, _, -)">
          <input
            className={input}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            required
            maxLength={32}
            placeholder="EXTRA10"
          />
        </Field>

        <Field label="Tip reducere">
          <div className="flex flex-wrap gap-2">
            <RadioPill checked={kind === 'PERCENT'} onSelect={() => setKind('PERCENT')} label="Procent (%)" />
            <RadioPill checked={kind === 'FIXED'} onSelect={() => setKind('FIXED')} label="Sumă fixă (RON)" />
            <RadioPill
              checked={kind === 'FREE_DELIVERY'}
              onSelect={() => setKind('FREE_DELIVERY')}
              label="Livrare gratuită"
            />
          </div>
        </Field>

        {kind !== 'FREE_DELIVERY' && (
          <Field label={kind === 'PERCENT' ? 'Procent (1-100)' : 'Reducere RON'}>
            <input
              type="number"
              className={input}
              value={valueInt}
              onChange={(e) => setValueInt(Number(e.target.value))}
              min={1}
              max={kind === 'PERCENT' ? 100 : undefined}
              required
            />
          </Field>
        )}

        <Field label="Comandă minimă (RON)">
          <input
            type="number"
            className={input}
            value={minOrderRon}
            onChange={(e) => setMinOrderRon(Number(e.target.value))}
            min={0}
            step={1}
          />
        </Field>

        <Field label="Folosiri maxime (gol = nelimitat)">
          <input
            type="number"
            className={input}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            min={1}
            placeholder="∞"
          />
        </Field>

        <Field label="Activ">
          <label className="mt-1 inline-flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Codul poate fi aplicat
          </label>
        </Field>

        <Field label="Valabil de la">
          <input
            type="date"
            className={input}
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
          />
        </Field>

        <Field label="Valabil până la">
          <input
            type="date"
            className={input}
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </Field>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {pending ? 'Se salvează…' : editing ? 'Salvează modificările' : 'Creează cod'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Anulează
        </button>
      </div>
    </form>
  );
}

const input =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-zinc-700">{label}</span>
      {children}
    </label>
  );
}

function RadioPill({
  checked,
  onSelect,
  label,
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={
        'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ' +
        (checked
          ? 'border-zinc-900 bg-zinc-900 text-white'
          : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50')
      }
    >
      {label}
    </button>
  );
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function errorLabel(error: string, detail?: string): string {
  if (error === 'duplicate_code') return 'Există deja un cod identic pentru acest restaurant.';
  if (error === 'forbidden_owner_only') return 'Doar OWNER poate modifica coduri.';
  if (error === 'tenant_mismatch') return 'Sesiunea de restaurant s-a schimbat. Reîncarcă pagina.';
  if (error === 'invalid_input') {
    if (detail === 'invalid_code') return 'Cod invalid. Folosește A-Z, 0-9, _, -, între 2 și 32 caractere.';
    if (detail === 'percent_out_of_range') return 'Procentul trebuie să fie între 1 și 100.';
    if (detail === 'fixed_must_be_positive') return 'Valoarea trebuie să fie pozitivă.';
    if (detail === 'invalid_window') return 'Data de început trebuie să fie înainte de data de sfârșit.';
    return 'Date invalide.';
  }
  return error;
}
