// Drafts list — interactive client surface.
//
// Renders the cards + filter chrome + approve/reject buttons. POSTs to
// /api/content/drafts/[id]/(approve|reject) and refreshes via
// router.refresh() so the server component re-fetches.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, CheckCircle, Pencil, X, RefreshCw } from 'lucide-react';

export type DraftStatus = 'pending' | 'approved' | 'rejected';

export interface DraftView {
  id: string;
  status: DraftStatus;
  format: string;
  brandLabel: string;
  hook?: string;
  body: string;
  hashtags: string[];
  visualBrief?: string;
  videoUrl?: string;
  videoAge: string;
  videoCostRon: string | null;
}

interface DraftsClientProps {
  drafts: DraftView[];
  brands: { id: string; label: string }[];
  initialBrand: string | null;
  initialStatus: string | null;
}

const FILTER_TABS: { key: 'all' | DraftStatus; label: string }[] = [
  { key: 'all', label: 'Toate' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Aprobate' },
  { key: 'rejected', label: 'Respinse' },
];

const STATUS_PILL: Record<DraftStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 border border-amber-200',
  approved: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  rejected: 'bg-rose-100 text-rose-800 border border-rose-200',
};

const STATUS_LABEL: Record<DraftStatus, string> = {
  pending: 'Pending',
  approved: 'Aprobat',
  rejected: 'Respins',
};

export function DraftsClient({ drafts, brands, initialBrand, initialStatus }: DraftsClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const pendingCount = drafts.filter((d) => d.status === 'pending').length;
  const activeFilter = (initialStatus as 'all' | DraftStatus | null) ?? 'all';

  function navigate(opts: { brand?: string | null; status?: string | null }) {
    const sp = new URLSearchParams();
    const nextBrand = opts.brand === undefined ? initialBrand : opts.brand;
    const nextStatus = opts.status === undefined ? initialStatus : opts.status;
    if (nextBrand) sp.set('brand', nextBrand);
    if (nextStatus && nextStatus !== 'all') sp.set('status', nextStatus);
    const q = sp.toString();
    startTransition(() => {
      router.push(`/dashboard/content/drafts${q ? `?${q}` : ''}`);
    });
  }

  async function postAction(draftId: string, action: 'approve' | 'reject'): Promise<void> {
    setError(null);
    try {
      const res = await fetch(`/api/content/drafts/${draftId}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? `${action}_failed`);
        return;
      }
      // Refresh server data so the new status appears in the list.
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <FileText className="h-7 w-7 text-amber-500" aria-hidden />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Drafts</h1>
            <p className="mt-0.5 text-sm text-zinc-500">
              {pendingCount} {pendingCount === 1 ? 'draft' : 'drafts'} în așteptare
            </p>
          </div>
        </div>
        <nav
          aria-label="Filtrare drafts"
          className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1"
        >
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => navigate({ status: tab.key === 'all' ? null : tab.key })}
              aria-pressed={activeFilter === tab.key}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeFilter === tab.key
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
              disabled={pending}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {brands.length > 1 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-zinc-500">Brand:</span>
          <button
            type="button"
            onClick={() => navigate({ brand: null })}
            className={`rounded-md border px-2 py-1 ${
              !initialBrand ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
            }`}
            disabled={pending}
          >
            Toate
          </button>
          {brands.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => navigate({ brand: b.id })}
              className={`rounded-md border px-2 py-1 ${
                initialBrand === b.id ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
              }`}
              disabled={pending}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">
          {error}
        </p>
      )}

      {drafts.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {drafts.map((draft) => (
            <DraftCard
              key={draft.id}
              draft={draft}
              busy={pending}
              onApprove={() => postAction(draft.id, 'approve')}
              onReject={() => postAction(draft.id, 'reject')}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DraftCard({
  draft,
  busy,
  onApprove,
  onReject,
}: {
  draft: DraftView;
  busy: boolean;
  onApprove: () => void | Promise<void>;
  onReject: () => void | Promise<void>;
}) {
  return (
    <article
      aria-label={`Draft ${draft.format}: ${draft.body.slice(0, 40)}…`}
      className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center rounded-full bg-zinc-900 px-2.5 py-0.5 text-[11px] font-semibold text-white">
          {draft.format}
        </span>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_PILL[draft.status]}`}
        >
          {STATUS_LABEL[draft.status]}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">{draft.brandLabel} · {draft.videoAge}</p>

      {draft.hook && (
        <p className="mt-3 text-sm font-semibold text-zinc-900">&ldquo;{draft.hook}&rdquo;</p>
      )}

      <p className="mt-2 text-sm leading-relaxed text-zinc-700">{draft.body}</p>

      {draft.hashtags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {draft.hashtags.map((tag) => (
            <span key={tag} className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500">
              {tag.startsWith('#') ? tag : `#${tag}`}
            </span>
          ))}
        </div>
      )}

      {draft.visualBrief && (
        <div className="mt-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Brief vizual</p>
          <p className="mt-0.5 text-xs text-zinc-600">{draft.visualBrief}</p>
        </div>
      )}

      {draft.videoCostRon && (
        <p className="mt-2 text-xs text-zinc-500">Cost generare: {draft.videoCostRon}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {draft.status === 'pending' && (
          <>
            <button
              type="button"
              onClick={() => onApprove()}
              aria-label="Aprobă draft-ul"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              <CheckCircle className="h-3.5 w-3.5" aria-hidden />
              Aprobă
            </button>
            <button
              type="button"
              onClick={() => onReject()}
              aria-label="Respinge draft-ul"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Respinge
            </button>
            <button
              type="button"
              aria-label="Modifică draft-ul (în curând)"
              disabled
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-400"
              title="În curând"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Modifică
            </button>
          </>
        )}
        {draft.status === 'rejected' && (
          <button
            type="button"
            aria-label="Regenerează draft-ul (în curând)"
            disabled
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-400"
            title="În curând"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Regenerează
          </button>
        )}
      </div>
    </article>
  );
}
