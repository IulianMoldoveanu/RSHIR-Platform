'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';

const STORAGE_KEY = 'hir.fleet.orders-search';

/**
 * Client-side search box that filters the dispatch board's order rows
 * already in the DOM. We don't re-query — orders are server-rendered
 * and refreshed via realtime; pure DOM filtering keeps this snappy and
 * doesn't add a server round-trip per keystroke.
 *
 * Filtering rules:
 *   - empty query → show everything (default)
 *   - matches order id prefix (first 8 chars), customer name, pickup,
 *     dropoff (case-insensitive substring)
 *   - rows that don't match are hidden (display:none, not removed) so
 *     clearing the query restores them instantly.
 *
 * Each <li> on /fleet/orders is tagged with `data-search-blob` so this
 * component doesn't need to re-implement the search shape.
 */
export function FleetOrdersSearch() {
  const [query, setQuery] = useState('');

  // Restore last query so a refresh doesn't lose context.
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(STORAGE_KEY) ?? '';
      if (saved) setQuery(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, query);
    } catch {
      /* ignore */
    }

    const lis = document.querySelectorAll<HTMLLIElement>('[data-search-blob]');
    const norm = query.trim().toLowerCase();
    let visible = 0;
    for (const li of lis) {
      const blob = (li.dataset.searchBlob ?? '').toLowerCase();
      const match = norm === '' || blob.includes(norm);
      li.style.display = match ? '' : 'none';
      if (match) visible++;
    }

    // Toggle a tiny "no results" pill if everything is hidden.
    // The banner ships with Tailwind's `hidden` class (display:none);
    // setting inline display to '' doesn't override that class, so we
    // toggle the class itself. Codex P2 #176.
    const banner = document.getElementById('fleet-orders-search-empty');
    if (banner) {
      const showBanner = norm !== '' && visible === 0;
      banner.classList.toggle('hidden', !showBanner);
    }
  }, [query]);

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
        aria-hidden
      />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Caută client, adresă sau ID comandă"
        className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-2 pl-9 pr-9 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
        aria-label="Caută în comenzi"
      />
      {query ? (
        <button
          type="button"
          onClick={() => setQuery('')}
          aria-label="Șterge căutarea"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
