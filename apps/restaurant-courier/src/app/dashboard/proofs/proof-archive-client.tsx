'use client';

import { useState, useMemo } from 'react';
import { Camera, X, Calendar, MapPin, User } from 'lucide-react';
import { Button } from '@hir/ui';
import { cardClasses } from '@/components/card';

type ProofItem = {
  id: string;
  deliveredAt: string;
  customerFirstName: string | null;
  dropoffLine1: string | null;
  signedUrl: string;
};

type Props = {
  items: ProofItem[];
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ro-RO', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
}

// ISO date string (YYYY-MM-DD) for a Date object in local time.
function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ProofArchiveClient({ items }: Props) {
  const [selected, setSelected] = useState<ProofItem | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const filtered = useMemo(() => {
    if (!fromDate && !toDate) return items;
    return items.filter((item) => {
      const d = toLocalDate(new Date(item.deliveredAt));
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }, [items, fromDate, toDate]);

  function clearFilters() {
    setFromDate('');
    setToDate('');
  }

  return (
    <>
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-hir-fg">Fotografii livrări</h1>
          <p className="mt-1 text-sm text-hir-muted-fg">
            Ultimele 30 de zile · {items.length}{' '}
            {items.length === 1 ? 'fotografie' : 'fotografii'}
          </p>
        </div>

        {/* Date range filter */}
        <section className={cardClasses()}>
          <div className="mb-3 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-hir-muted-fg" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-wide text-hir-muted-fg">
              Filtrare perioadă
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="from-date">De la data</label>
            <input
              id="from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="flex-1 rounded-lg border border-hir-border bg-hir-bg px-3 py-2 text-sm text-hir-fg focus:border-violet-500 focus:outline-none"
            />
            <span className="text-xs text-hir-muted-fg">până la</span>
            <label className="sr-only" htmlFor="to-date">Până la data</label>
            <input
              id="to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="flex-1 rounded-lg border border-hir-border bg-hir-bg px-3 py-2 text-sm text-hir-fg focus:border-violet-500 focus:outline-none"
            />
            {(fromDate || toDate) ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-auto shrink-0 px-2 py-2 text-hir-muted-fg hover:text-hir-fg"
                aria-label="Resetează filtrele"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          {(fromDate || toDate) ? (
            <p className="mt-2 text-[11px] text-hir-muted-fg">
              {filtered.length} din {items.length}{' '}
              {items.length === 1 ? 'fotografie' : 'fotografii'} afișate
            </p>
          ) : null}
        </section>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className={cardClasses({ padding: 'none', className: 'flex flex-col items-center gap-3 py-14 text-center' })}>
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-hir-border">
              <Camera className="h-7 w-7 text-hir-muted-fg" aria-hidden />
            </span>
            <p className="text-sm font-medium text-hir-fg">
              {items.length === 0
                ? 'Nu ai poze încărcate'
                : 'Nicio fotografie în intervalul selectat'}
            </p>
            <p className="max-w-xs text-xs text-hir-muted-fg">
              {items.length === 0
                ? 'Pozele apar aici după primele livrări cu fotografie de confirmare.'
                : 'Încearcă un interval mai larg sau resetează filtrele.'}
            </p>
          </div>
        ) : (
          <div
            className="grid grid-cols-3 gap-2"
            role="list"
            aria-label="Galerie fotografii livrări"
          >
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                role="listitem"
                onClick={() => setSelected(item)}
                aria-label={`Fotografie livrare ${formatDate(item.deliveredAt)}`}
                className="group relative aspect-square overflow-hidden rounded-xl border border-hir-border bg-hir-border focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.signedUrl}
                  alt={`Dovadă livrare ${formatDate(item.deliveredAt)}`}
                  className="h-full w-full object-cover transition-opacity duration-200 group-hover:opacity-80"
                  loading="lazy"
                />
                {/* Date overlay */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4">
                  <p className="truncate text-[9px] font-medium text-white">
                    {formatTime(item.deliveredAt)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Full-screen modal */}
      {selected !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Fotografie livrare"
          className="fixed inset-0 z-[2000] flex flex-col bg-black"
          onClick={() => setSelected(null)}
        >
          {/* Close bar */}
          <div
            className="flex items-center justify-between px-4 py-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-white">Dovadă livrare</p>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Închide"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Photo */}
          <div
            className="flex flex-1 items-center justify-center overflow-hidden px-2"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selected.signedUrl}
              alt="Fotografie dovadă livrare"
              className="max-h-full max-w-full rounded-xl object-contain"
            />
          </div>

          {/* Meta strip */}
          <div
            className="px-4 pb-8 pt-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-2 text-sm text-white">
                <Calendar className="h-4 w-4 shrink-0 text-white/60" aria-hidden />
                <span>
                  {formatDate(selected.deliveredAt)}, {formatTime(selected.deliveredAt)}
                </span>
              </div>
              {selected.customerFirstName ? (
                <div className="mt-2 flex items-center gap-2 text-sm text-white">
                  <User className="h-4 w-4 shrink-0 text-white/60" aria-hidden />
                  <span>Client: {selected.customerFirstName}</span>
                </div>
              ) : null}
              {selected.dropoffLine1 ? (
                <div className="mt-2 flex items-start gap-2 text-sm text-white">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-white/60" aria-hidden />
                  <span>{selected.dropoffLine1}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
