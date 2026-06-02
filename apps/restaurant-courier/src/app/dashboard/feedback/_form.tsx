'use client';

import { useState, useTransition } from 'react';
import { Bug, Check, Lightbulb, Loader2 } from 'lucide-react';
import { Button } from '@hir/ui';
import { submitFeedbackAction } from './actions';

function detectPlatform(): string {
  if (typeof window === 'undefined') return 'web';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cap = (window as any).Capacitor;
  if (cap?.isNativePlatform?.()) return cap.getPlatform?.() ?? 'native';
  return 'web';
}

export function FeedbackForm() {
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<'SUGGESTION' | 'BUG'>('SUGGESTION');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    formData.set('platform', detectPlatform());
    start(async () => {
      const r = await submitFeedbackAction(formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <section className="rounded-2xl border border-emerald-700/40 bg-emerald-500/5 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
            <Check className="h-5 w-5" aria-hidden />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-200">Mulțumim! Am primit mesajul tău.</p>
            <p className="mt-1 text-xs text-zinc-400">
              Managerul flotei și echipa HIR îl văd și revin dacă e nevoie.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDone(false)}
              className="mt-3 border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
            >
              Trimite încă unul
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="kind" value={kind} />

      <div className="grid grid-cols-2 gap-2">
        <KindOption
          active={kind === 'SUGGESTION'}
          onClick={() => setKind('SUGGESTION')}
          icon={<Lightbulb className="h-5 w-5" aria-hidden />}
          label="Sugestie"
        />
        <KindOption
          active={kind === 'BUG'}
          onClick={() => setKind('BUG')}
          icon={<Bug className="h-5 w-5" aria-hidden />}
          label="Problemă"
        />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-200">
          {kind === 'SUGGESTION' ? 'Ce am putea îmbunătăți?' : 'Ce nu funcționează?'}
        </span>
        <textarea
          name="message"
          required
          minLength={5}
          maxLength={2000}
          rows={5}
          className="w-full resize-y rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
          placeholder={
            kind === 'SUGGESTION'
              ? 'ex: ar fi util un buton de pauză rapidă în timpul turei…'
              : 'ex: harta nu se încarcă după ce accept o comandă…'
          }
        />
      </label>

      {error ? (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={pending}
        className="gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-400"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {pending ? 'Se trimite…' : 'Trimite'}
      </Button>
    </form>
  );
}

function KindOption({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-3 text-xs font-medium transition ${
        active
          ? 'border-violet-500 bg-violet-500/10 text-violet-200'
          : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
      }`}
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
