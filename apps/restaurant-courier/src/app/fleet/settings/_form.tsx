'use client';

import { useState, useTransition } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { updateFleetSettingsAction } from '../actions';
import { Button } from '@hir/ui';

type Initial = {
  name: string;
  brandColor: string;
  contactPhone: string;
};

export function FleetSettingsForm({ initial }: { initial: Initial }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    start(async () => {
      const result = await updateFleetSettingsAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      // Auto-clear the saved badge so subsequent edits aren't shadowed.
      window.setTimeout(() => setSaved(false), 2400);
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <Field label="Nume flotă" hint="Apare în antet și pe badge-ul curierilor.">
        <input
          name="name"
          required
          defaultValue={initial.name}
          maxLength={80}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
          placeholder="Ex: SpeedyRide Brașov"
        />
      </Field>

      <Field
        label="Culoare brand"
        hint="Folosit pentru pătratul cu inițiala în antet."
      >
        <div className="flex items-center gap-2">
          <input
            type="color"
            name="brand_color"
            defaultValue={initial.brandColor}
            className="h-10 w-12 cursor-pointer rounded-md border border-zinc-800 bg-zinc-950 p-1"
            aria-label="Culoare brand"
          />
          <code className="rounded-md bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-400">
            {initial.brandColor.toUpperCase()}
          </code>
        </div>
      </Field>

      <Field
        label="Telefon dispecer"
        hint="Format E.164. Curierii Mode-C pot apăsa pe badge ca să te sune direct."
      >
        <input
          name="contact_phone"
          type="tel"
          inputMode="tel"
          pattern="\+\d{8,15}"
          defaultValue={initial.contactPhone}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
          placeholder="+40732128199"
        />
      </Field>

      {error ? (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <Button
          type="submit"
          disabled={pending}
          className="gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-400"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {pending ? 'Se salvează…' : 'Salvează'}
        </Button>
        {saved ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
            <Check className="h-3.5 w-3.5" aria-hidden /> Salvat
          </span>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-200">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-zinc-500">{hint}</span> : null}
    </label>
  );
}
