'use client';

import { useState, useTransition } from 'react';
import { ShieldCheck } from 'lucide-react';
import { saveEmbedOriginsAction } from './actions';

// Owner-facing control for the frame-ancestors allow-list. Kept deliberately
// plain: one domain per line, and the copy says what happens if the list is
// empty, because an empty list silently means "the widget won't load".

export function EmbedOriginsForm({
  tenantId,
  initialOrigins,
  canEdit,
  verifiedDomain,
}: {
  tenantId: string;
  initialOrigins: string[];
  canEdit: boolean;
  verifiedDomain: string | null;
}) {
  const [value, setValue] = useState(initialOrigins.join('\n'));
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setStatus(null);
    startTransition(async () => {
      const res = await saveEmbedOriginsAction(value, tenantId);
      if (res.ok) {
        setValue(res.origins.join('\n'));
        setStatus({
          kind: 'ok',
          text: res.origins.length
            ? `Salvat. ${res.origins.length} ${res.origins.length === 1 ? 'domeniu permis' : 'domenii permise'}.`
            : 'Salvat. Momentan niciun site extern nu poate încărca widgetul.',
        });
      } else {
        const text =
          res.error === 'forbidden_owner_only'
            ? 'Doar contul OWNER poate schimba lista.'
            : res.error === 'invalid_input'
              ? `Nu am recunoscut: ${res.detail ?? 'valoare invalidă'}`
              : 'Nu am putut salva. Încearcă din nou.';
        setStatus({ kind: 'err', text });
      }
    });
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
          <ShieldCheck className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-zinc-900">Site-uri unde poate apărea widgetul</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Din motive de securitate, widgetul se încarcă doar pe domeniile de
            mai jos. Scrie un domeniu pe linie.
          </p>

          {verifiedDomain && (
            <p className="mt-2 text-xs text-emerald-700">
              <strong>{verifiedDomain}</strong> este deja permis automat — e domeniul tău verificat.
            </p>
          )}

          <label htmlFor="embed-origins" className="sr-only">
            Domenii permise
          </label>
          <textarea
            id="embed-origins"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={!canEdit || pending}
            rows={4}
            spellCheck={false}
            placeholder={'restaurantulmeu.ro\nwww.restaurantulmeu.ro'}
            className="mt-3 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-400"
          />

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={!canEdit || pending}
              className="rounded-md bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {pending ? 'Se salvează…' : 'Salvează lista'}
            </button>
            {status && (
              <span
                role="status"
                className={`text-sm ${status.kind === 'ok' ? 'text-emerald-700' : 'text-rose-700'}`}
              >
                {status.text}
              </span>
            )}
          </div>

          <p className="mt-3 text-xs text-zinc-500">
            Lista goală înseamnă că widgetul nu se încarcă pe niciun site
            extern. Modificările se propagă în cel mult 5 minute.
          </p>
        </div>
      </div>
    </section>
  );
}
