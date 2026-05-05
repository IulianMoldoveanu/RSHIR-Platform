'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';

// Lightweight client-side search. We avoid a fuzzy library (no extra
// dependency) and use simple lowercase substring matching with a 3x weight
// for title hits. Volume is small (~25 topics) — this stays fast even on
// a low-end Android.

export type SearchTopic = {
  slug: string;
  categorySlug: string;
  categoryTitle: string;
  title: string;
  summary: string;
  body: string;
};

type Hit = SearchTopic & { score: number; snippet: string };

function score(query: string, t: SearchTopic): { score: number; snippet: string } {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, snippet: '' };
  const tokens = q.split(/\s+/).filter(Boolean);
  let s = 0;
  let snippetSource = t.summary;
  for (const tok of tokens) {
    if (t.title.toLowerCase().includes(tok)) s += 3;
    if (t.summary.toLowerCase().includes(tok)) s += 2;
    const idx = t.body.toLowerCase().indexOf(tok);
    if (idx >= 0) {
      s += 1;
      if (snippetSource === t.summary) {
        const start = Math.max(0, idx - 40);
        snippetSource = t.body.slice(start, idx + 80);
        if (start > 0) snippetSource = '…' + snippetSource;
      }
    }
  }
  return { score: s, snippet: snippetSource };
}

export function HelpSearch({ topics }: { topics: SearchTopic[] }) {
  const [q, setQ] = useState('');

  const results = useMemo<Hit[]>(() => {
    if (!q.trim()) return [];
    const hits: Hit[] = [];
    for (const t of topics) {
      const { score: sc, snippet } = score(q, t);
      if (sc > 0) hits.push({ ...t, score: sc, snippet });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, 5);
  }, [q, topics]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
      <label className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 focus-within:border-purple-400 focus-within:bg-white">
        <Search className="h-4 w-4 flex-none text-zinc-400" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Caută în ghiduri (ex: notificări, GloriaFood, GPS)…"
          className="w-full border-0 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
          aria-label="Caută în ghiduri"
        />
      </label>

      {q.trim() && (
        <div className="mt-3 space-y-1.5">
          {results.length === 0 ? (
            <p className="px-1 py-2 text-xs text-zinc-500">
              Niciun rezultat. Încercați alte cuvinte sau parcurgeți categoriile de mai jos.
            </p>
          ) : (
            results.map((hit) => (
              <Link
                key={hit.slug}
                href={`/dashboard/help/${hit.categorySlug}/${hit.slug}`}
                className="block rounded-lg border border-zinc-200 bg-white p-2.5 transition-colors hover:border-purple-300 hover:bg-purple-50/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-zinc-900">{hit.title}</p>
                  <span className="flex-none text-[10px] uppercase tracking-wide text-zinc-400">
                    {hit.categoryTitle}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-zinc-600">{hit.snippet}</p>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
