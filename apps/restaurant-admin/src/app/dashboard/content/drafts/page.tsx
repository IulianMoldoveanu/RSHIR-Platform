'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  FileText,
  Eye,
  CheckCircle,
  Pencil,
  Calendar,
  X,
  RefreshCw,
  Trash2,
  MessageSquare,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

type DraftStatus = 'pending' | 'approved' | 'rejected';

type FilterTab = 'all' | DraftStatus;

type Draft = {
  id: number;
  platform: string;
  platformColor: string;
  format: string;
  status: DraftStatus;
  hook?: string;
  body: string;
  hashtags: string[];
  visualBrief?: string;
  videoProvider?: string;
  videoAge?: string;
  videoCost?: string;
  scheduledFor?: string;
  rejectReason?: string;
};

const DRAFTS: Draft[] = [
  {
    id: 1,
    platform: 'TikTok',
    platformColor: 'bg-zinc-900 text-white',
    format: 'TikTok Reel · 25 sec',
    status: 'pending',
    hook: 'Aveți pizza pentru un cartof astăzi?',
    body: 'Pizza Margherita la doar 25 RON. Doar azi, cu livrare gratuită în Brașov!',
    hashtags: ['#pizza', '#brasov', '#livrare', '#margherita'],
    visualBrief:
      'Top-down shot pizza margherita, frunze busuioc, lemn natural, lumină caldă, vertical 9:16',
    videoProvider: 'Pika 2.5',
    videoAge: 'Generat acum 2 min',
    videoCost: '~$0.25',
  },
  {
    id: 2,
    platform: 'Instagram',
    platformColor: 'bg-gradient-to-r from-pink-500 to-orange-400 text-white',
    format: 'IG Reel · 18 sec',
    status: 'pending',
    hook: 'Cum economisește Mihai 4.200 RON/lună',
    body: 'De când am renunțat la Glovo, comenzile vin direct prin HIR. Iulian, sunt salvat!',
    hashtags: ['#patron', '#pizza', '#romania', '#economie'],
    videoProvider: 'Runway Gen-3',
    videoAge: 'Generat acum 5 min',
    videoCost: '~$1.50',
  },
  {
    id: 3,
    platform: 'Facebook',
    platformColor: 'bg-blue-600 text-white',
    format: 'Facebook Post · static',
    status: 'approved',
    body: 'WEEKEND DEAL: 2 pizze mari + suc gratis = 49 RON. Comandă acum pe site!',
    hashtags: ['#weekend', '#deal', '#pizza', '#brasov'],
    scheduledFor: 'Vineri 18:00 (în 2 zile)',
  },
  {
    id: 4,
    platform: 'LinkedIn',
    platformColor: 'bg-sky-700 text-white',
    format: 'LinkedIn Post',
    status: 'pending',
    body: 'Cum am ridicat marja restaurantului de la 8% la 24% în 3 luni. Read more →',
    hashtags: ['#restaurantowner', '#pizza', '#romania'],
  },
  {
    id: 5,
    platform: 'X',
    platformColor: 'bg-zinc-800 text-white',
    format: 'X Post',
    status: 'rejected',
    body: 'Glovo îți ia 30%. HIR îți ia 2 lei. Math?',
    hashtags: ['#glovo', '#hir', '#pizza'],
    rejectReason: 'Prea agresiv, schimbă tonul',
  },
];

const FILTER_TABS: { key: FilterTab; label: string }[] = [
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

function DraftCard({ draft }: { draft: Draft }) {
  return (
    <article
      aria-label={`Draft ${draft.platform}: ${draft.body.slice(0, 40)}...`}
      className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      {/* Top row: platform badge + status */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${draft.platformColor}`}
        >
          {draft.format}
        </span>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_PILL[draft.status]}`}
        >
          {STATUS_LABEL[draft.status]}
        </span>
      </div>

      {/* Hook */}
      {draft.hook && (
        <p className="mt-3 text-sm font-semibold text-zinc-900">&ldquo;{draft.hook}&rdquo;</p>
      )}

      {/* Body */}
      <p className="mt-2 text-sm leading-relaxed text-zinc-700">{draft.body}</p>

      {/* Hashtags */}
      <div className="mt-2 flex flex-wrap gap-1">
        {draft.hashtags.map((tag) => (
          <span
            key={tag}
            className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Visual brief */}
      {draft.visualBrief && (
        <div className="mt-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            Brief vizual
          </p>
          <p className="mt-0.5 text-xs text-zinc-600">{draft.visualBrief}</p>
        </div>
      )}

      {/* Video provider row */}
      {draft.videoProvider && (
        <p className="mt-2 text-xs text-zinc-500">
          <span className="font-medium">{draft.videoProvider}</span> — {draft.videoAge} ·{' '}
          <span className="text-zinc-400">{draft.videoCost}</span>
        </p>
      )}

      {/* Scheduled */}
      {draft.scheduledFor && (
        <p className="mt-2 flex items-center gap-1 text-xs text-emerald-700">
          <Calendar className="h-3.5 w-3.5" aria-hidden />
          Programat: {draft.scheduledFor}
        </p>
      )}

      {/* Reject reason */}
      {draft.rejectReason && (
        <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-rose-50 px-3 py-2">
          <MessageSquare className="mt-0.5 h-3.5 w-3.5 flex-none text-rose-500" aria-hidden />
          <p className="text-xs text-rose-700">
            <span className="font-semibold">Motiv respingere:</span> {draft.rejectReason}
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-4 flex flex-wrap gap-2">
        {draft.status === 'pending' && (
          <>
            {draft.videoProvider && (
              <button
                type="button"
                aria-label="Previzualizează videoclipul"
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                <Eye className="h-3.5 w-3.5" aria-hidden />
                Preview video
              </button>
            )}
            <button
              type="button"
              aria-label="Aprobă și publică draft-ul"
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              <CheckCircle className="h-3.5 w-3.5" aria-hidden />
              Aprobă &amp; publică
            </button>
            <button
              type="button"
              aria-label="Modifică draft-ul"
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Modifică
            </button>
          </>
        )}

        {draft.status === 'approved' && (
          <>
            <button
              type="button"
              aria-label="Modifică schedule-ul publicării"
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              <Calendar className="h-3.5 w-3.5" aria-hidden />
              Modifică schedule
            </button>
            <button
              type="button"
              aria-label="Anulează publicarea"
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Anulează
            </button>
          </>
        )}

        {draft.status === 'rejected' && (
          <>
            <button
              type="button"
              aria-label="Regenerează draft-ul"
              className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Regenerează
            </button>
            <button
              type="button"
              aria-label="Șterge draft-ul"
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Șterge
            </button>
          </>
        )}
      </div>
    </article>
  );
}

export default function ContentDraftsPage() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  const filtered =
    activeFilter === 'all' ? DRAFTS : DRAFTS.filter((d) => d.status === activeFilter);

  const pendingCount = DRAFTS.filter((d) => d.status === 'pending').length;

  return (
    <div className="mx-auto max-w-4xl py-6">
      <Link
        href="/dashboard/content"
        className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Înapoi la Content
      </Link>

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <FileText className="h-7 w-7 text-amber-500" aria-hidden />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Drafts</h1>
            <p className="mt-0.5 text-sm text-zinc-500">
              {pendingCount} drafts în așteptare
            </p>
          </div>
        </div>

        {/* Filter tabs */}
        <nav
          aria-label="Filtrare drafts"
          className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1"
        >
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveFilter(tab.key)}
              aria-pressed={activeFilter === tab.key}
              aria-label={`Filtrează: ${tab.label}`}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeFilter === tab.key
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Cards grid */}
      {filtered.length > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {filtered.map((draft) => (
            <DraftCard key={draft.id} draft={draft} />
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
          <FileText className="mx-auto h-10 w-10 text-zinc-300" aria-hidden />
          <p className="mt-3 text-sm font-medium text-zinc-600">Nu există drafts în această categorie.</p>
          <p className="mt-1 text-xs text-zinc-500">
            Trimite o comandă lui Hepi pe Telegram:{' '}
            <code className="rounded bg-zinc-200 px-1 py-0.5 font-mono">/reclama</code>
          </p>
        </div>
      )}

      {/* Demo mode notice */}
      <p className="mt-8 text-center text-[11px] text-zinc-400">
        Mod demo — date simulate. Conectează Hepi pentru drafts reale.
      </p>
    </div>
  );
}
