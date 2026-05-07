'use client';

// "Sugestii Hepy" panel — per-review button that opens an inline panel
// with 3 generated reply options. Owner picks one, can edit the text,
// then either copies it (manual paste) or marks the suggestion POSTED.
//
// Trust note: this UI never auto-posts. The orchestrator trust gate is
// configured in /dashboard/settings/ai-trust; even at AUTO_REVERSIBLE the
// server action `postReviewReply` re-checks `assertNotAutoPostingNegative`
// before flipping status to POSTED on a low-rating review.

import { useEffect, useState, useTransition } from 'react';
import { Sparkles, ChevronDown, Copy, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import {
  generateReviewReplyDraft,
  selectReviewReplyOption,
  markReviewReplyPosted,
  dismissReviewReplyDraft,
  type DraftSnapshot,
} from './hepy-actions';

type Props = {
  reviewId: string;
  rating: number;
  comment: string | null;
  tenantId: string;
  // If a draft already exists for this review, render it inline instead
  // of the "Generează" button.
  existingDraft: DraftSnapshot | null;
};

export function HepySuggestions({ reviewId, rating, comment, tenantId, existingDraft }: Props) {
  const [open, setOpen] = useState(Boolean(existingDraft));
  const [draft, setDraft] = useState<DraftSnapshot | null>(existingDraft);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [editedText, setEditedText] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [posting, setPosting] = useState(false);

  // Sync the editable textarea when a new option is selected. We
  // intentionally key the effect on (draft.id, draft.selected_option)
  // instead of the full `draft` object — re-running on every state mutation
  // would clobber the OWNER's in-progress edits.
  const draftId = draft?.id ?? null;
  const draftSelected = draft?.selected_option ?? null;
  const draftOptions = draft?.response_options as { options?: Array<{ text: string }> } | undefined;
  useEffect(() => {
    if (draftId && draftSelected !== null) {
      const opt = draftOptions?.options?.[draftSelected];
      if (opt) setEditedText(opt.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, draftSelected]);

  function generate() {
    setError(null);
    start(async () => {
      try {
        const result = await generateReviewReplyDraft({ reviewId, tenantId });
        setDraft(result);
        setOpen(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Eroare la generare.');
      }
    });
  }

  function pick(idx: number) {
    if (!draft) return;
    setError(null);
    start(async () => {
      try {
        const updated = await selectReviewReplyOption({
          draftId: draft.id,
          tenantId,
          selectedOption: idx,
        });
        setDraft(updated);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Eroare la selecție.');
      }
    });
  }

  async function copyText() {
    if (!editedText) return;
    try {
      await navigator.clipboard.writeText(editedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Browser refused (e.g. focus loss) — fall back to a hidden textarea.
      // We keep the message in the textbox so the OWNER can copy by hand.
    }
  }

  function markPosted() {
    if (!draft) return;
    setPosting(true);
    setError(null);
    start(async () => {
      try {
        const updated = await markReviewReplyPosted({
          draftId: draft.id,
          tenantId,
          finalText: editedText,
        });
        setDraft(updated);
        setPosting(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Eroare la marcare publicat.');
        setPosting(false);
      }
    });
  }

  function dismiss() {
    if (!draft) return;
    // Codex P2 #356: a POSTED draft must not be dismissed — that would
    // overwrite a real action with "user closed the suggestion". For
    // POSTED rows we just collapse the panel locally; the server-side
    // `dismissReviewReplyDraft` also hard-rejects POSTED as defense in
    // depth, but treating it client-side keeps the UI honest and avoids
    // a no-op round-trip.
    if (draft.status === 'POSTED') {
      setOpen(false);
      return;
    }
    setError(null);
    start(async () => {
      try {
        await dismissReviewReplyDraft({ draftId: draft.id, tenantId });
        setDraft(null);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Eroare la închidere.');
      }
    });
  }

  if (!open && !draft) {
    return (
      <button
        type="button"
        onClick={generate}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md border border-purple-200 bg-purple-50 px-2.5 py-1.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100 disabled:opacity-50"
        title="Hepy generează 3 variante de răspuns"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {pending ? 'Hepy gândește…' : 'Sugestii Hepy'}
      </button>
    );
  }

  const options =
    (draft?.response_options as { options?: Array<{ tone: string; text: string }> })?.options ?? [];
  const sentiment =
    (draft?.response_options as { sentiment?: 'negative' | 'neutral' | 'positive' })?.sentiment ?? 'neutral';
  const isNegative = sentiment === 'negative' || rating <= 3;

  return (
    <div className="mt-2 w-full rounded-lg border border-purple-200 bg-purple-50/50 p-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 font-semibold text-purple-800">
          <Sparkles className="h-3.5 w-3.5" />
          Sugestii Hepy
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-purple-700 hover:text-purple-900"
          aria-label={open ? 'Închide panoul' : 'Deschide panoul'}
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} />
        </button>
      </div>

      {open ? (
        <div className="space-y-3">
          {isNegative ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
              <p>
                Recenzie negativă — răspunsul automat este blocat. Veți publica
                manual după ce verificați conținutul.
              </p>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-rose-800">
              {error}
            </div>
          ) : null}

          {!draft ? (
            <p className="text-zinc-600">Se generează…</p>
          ) : (
            <>
              <div className="grid gap-2">
                {options.map((o, idx) => {
                  const active = draft.selected_option === idx;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => pick(idx)}
                      disabled={pending}
                      className={`group flex flex-col items-start rounded-md border p-2 text-left transition-colors disabled:opacity-50 ${
                        active
                          ? 'border-purple-500 bg-white shadow-sm'
                          : 'border-zinc-200 bg-white/60 hover:bg-white'
                      }`}
                    >
                      <span
                        className={`mb-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          active ? 'bg-purple-600 text-white' : 'bg-zinc-100 text-zinc-600'
                        }`}
                      >
                        {toneLabel(o.tone)}
                      </span>
                      <p className="whitespace-pre-wrap text-zinc-700">{o.text}</p>
                    </button>
                  );
                })}
              </div>

              {draft.selected_option !== null ? (
                <div className="space-y-2 border-t border-purple-200 pt-2">
                  <label className="block">
                    <span className="text-zinc-700">Text de publicat (editabil):</span>
                    <textarea
                      value={editedText}
                      onChange={(e) => setEditedText(e.target.value)}
                      rows={5}
                      className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-zinc-800 focus:border-purple-500 focus:outline-none"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={copyText}
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-zinc-700 hover:bg-zinc-50"
                    >
                      {copied ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copied ? 'Copiat' : 'Copiază'}
                    </button>
                    <button
                      type="button"
                      onClick={markPosted}
                      disabled={posting || draft.status === 'POSTED'}
                      className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-2.5 py-1.5 font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                    >
                      {draft.status === 'POSTED' ? 'Publicat' : posting ? 'Se marchează…' : 'Marchează publicat'}
                    </button>
                    <button
                      type="button"
                      onClick={dismiss}
                      className="ml-auto inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-zinc-600 hover:text-zinc-900"
                    >
                      <X className="h-3.5 w-3.5" />
                      Închide
                    </button>
                  </div>
                  <p className="text-[11px] italic text-zinc-500">
                    Scopul comentariului: {comment ? `"${comment.slice(0, 80)}${comment.length > 80 ? '…' : ''}"` : 'fără text'}
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function toneLabel(tone: string): string {
  switch (tone) {
    case 'formal':
      return 'Formal';
    case 'warm':
      return 'Cald';
    case 'direct':
      return 'Direct';
    default:
      return tone;
  }
}
