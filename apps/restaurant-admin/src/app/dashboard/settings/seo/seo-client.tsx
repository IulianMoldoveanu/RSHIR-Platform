'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveSeoAction, type SeoActionResult, type SeoSettings } from './actions';

export function SeoClient({
  initial,
  canEdit,
  tenantId,
}: {
  initial: SeoSettings;
  canEdit: boolean;
  tenantId: string;
}) {
  const router = useRouter();
  const [cuisine, setCuisine] = useState(initial.cuisine ?? '');
  const [metaDescription, setMetaDescription] = useState(initial.meta_description ?? '');
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<SeoActionResult | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || pending) return;
    setFeedback(null);
    start(async () => {
      const r = await saveSeoAction(
        { cuisine: cuisine || null, meta_description: metaDescription || null },
        tenantId,
      );
      setFeedback(r);
      if (r.ok) router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="cuisine" className="text-sm font-medium text-zinc-900">
          Tip de bucătărie
        </label>
        <input
          id="cuisine"
          type="text"
          value={cuisine}
          onChange={(e) => setCuisine(e.target.value)}
          disabled={!canEdit || pending}
          maxLength={80}
          placeholder="Pizza, Italian"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none disabled:bg-zinc-50"
        />
        <p className="text-xs text-zinc-500">
          Apare în structured data Restaurant. Liber, ex: „Pizza, Italian".
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="meta_description" className="text-sm font-medium text-zinc-900">
          Descriere pentru motoarele de căutare
        </label>
        <textarea
          id="meta_description"
          value={metaDescription}
          onChange={(e) => setMetaDescription(e.target.value)}
          disabled={!canEdit || pending}
          maxLength={200}
          rows={3}
          placeholder="Lasă gol pentru a folosi descrierea implicită."
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none disabled:bg-zinc-50"
        />
        <p className="text-xs text-zinc-500">
          Suprascrie descrierea OG/meta de pe pagina de start. Maxim 200 caractere.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs">
          {feedback?.ok && <span className="text-emerald-700">Salvat ✓</span>}
          {feedback && !feedback.ok && (
            <span className="text-rose-700">
              Eroare: {feedback.detail ?? feedback.error}
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={!canEdit || pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {pending ? 'Se salvează…' : 'Salvează'}
        </button>
      </div>
    </form>
  );
}
