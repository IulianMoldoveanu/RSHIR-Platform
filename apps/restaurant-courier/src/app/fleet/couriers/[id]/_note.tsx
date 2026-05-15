'use client';

import { useState, useTransition } from 'react';
import { Check, Loader2, Pencil, StickyNote } from 'lucide-react';
import { updateCourierNoteAction } from '../../actions';
import { Button } from '@hir/ui';

const MAX_LENGTH = 500;

/**
 * Manager-only free-text note for a courier. Read-only by default; tap
 * "Editează" to switch to a textarea. Save persists immediately and
 * collapses back to read mode. Cancel discards local changes.
 */
export function ManagerNoteEditor({
  userId,
  initial,
}: {
  userId: string;
  initial: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial ?? '');
  const [saved, setSaved] = useState<string | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function handleSave() {
    setError(null);
    start(async () => {
      const r = await updateCourierNoteAction(userId, draft);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSaved(draft.trim() === '' ? null : draft.trim());
      setEditing(false);
    });
  }

  function handleCancel() {
    setDraft(saved ?? '');
    setEditing(false);
    setError(null);
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          <StickyNote className="h-3 w-3" aria-hidden />
          Notiță (doar manager)
        </p>
        {!editing ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
            className="gap-1 border-zinc-700 bg-zinc-900 text-[11px] text-zinc-300 hover:bg-zinc-800"
          >
            <Pencil className="h-3 w-3" aria-hidden />
            {saved ? 'Editează' : 'Adaugă notă'}
          </Button>
        ) : null}
      </div>

      {!editing ? (
        saved ? (
          <p className="whitespace-pre-wrap text-sm text-zinc-200">{saved}</p>
        ) : (
          <p className="text-xs italic text-zinc-500">
            Nicio notă salvată. Folosește &quot;Adaugă notă&quot; pentru a reține context
            despre acest curier (vehicul, preferințe, incidente).
          </p>
        )
      ) : (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
            rows={4}
            placeholder="Ex: vehicul reparat 30/04, evită comenzi grele 1 săptămână."
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
            disabled={pending}
            autoFocus
          />
          <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-500">
            <span>
              {draft.length}/{MAX_LENGTH}
            </span>
            {error ? <span className="text-red-400">{error}</span> : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={pending}
              onClick={handleSave}
              className="gap-1.5 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-400"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Check className="h-3.5 w-3.5" aria-hidden />
              )}
              Salvează
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={handleCancel}
              className="rounded-lg border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
            >
              Anulează
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
