'use client';

// Owner-facing editor for Hepi's identity (name + tone). Presentation only —
// it does NOT change what Hepi may do (that's the trust settings). Saved to
// tenant_hepi_persona; injected into the assistant's system prompt by
// _shared/hepy-brain.ts buildPersonaPreamble.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { saveHepiPersona } from './actions';

const NAME_MAX = 40;
const TONE_MAX = 400;

const ERR_RO: Record<string, string> = {
  unauthenticated: 'Sesiunea a expirat. Reîncărcați pagina.',
  forbidden_owner_only: 'Doar proprietarul poate configura identitatea asistentului.',
  forbidden_tenant_mismatch: 'Restaurantul activ s-a schimbat. Reîncărcați pagina.',
  db_error: 'A apărut o eroare temporară. Reîncercați.',
};

export function HepiPersonaClient({
  tenantId,
  initialName,
  initialTone,
}: {
  tenantId: string;
  initialName: string;
  initialTone: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(initialName);
  const [tone, setTone] = useState(initialTone);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = name !== initialName || tone !== initialTone;

  function handleSave() {
    setError(null);
    setSaved(false);
    start(async () => {
      const r = await saveHepiPersona({
        expectedTenantId: tenantId,
        assistantName: name,
        personaTone: tone,
      });
      if (!r.ok) {
        setError(ERR_RO[r.error] ?? 'Eroare necunoscută.');
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-100">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-zinc-900">Identitatea asistentului</h2>
          <p className="text-xs text-zinc-600">
            Alegeți cum se numește și cum vorbește asistentul care vă răspunde pe
            WhatsApp și Telegram. Nu schimbă ce are voie să facă — doar cum sună.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-700">Nume asistent</span>
          <input
            type="text"
            value={name}
            maxLength={NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            placeholder="Hepi"
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm text-zinc-900 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-700">
            Ton / personalitate <span className="text-zinc-400">(opțional)</span>
          </span>
          <textarea
            value={tone}
            maxLength={TONE_MAX}
            onChange={(e) => setTone(e.target.value)}
            rows={3}
            placeholder="ex.: prietenos, direct, fără jargon; folosește-mi numele restaurantului"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
          />
          <span className="text-[11px] text-zinc-400">
            {tone.length}/{TONE_MAX}
          </span>
        </label>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={pending || !dirty}
            className="inline-flex w-fit items-center gap-1.5 rounded-md bg-purple-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : saved ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : null}
            {saved ? 'Salvat' : 'Salvează'}
          </button>
          {error && (
            <p role="alert" className="text-xs text-red-700">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
