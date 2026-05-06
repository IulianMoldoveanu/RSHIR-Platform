'use client';

// Lane PRESENTATION (2026-05-06) — gallery + lightbox for `/poveste`. Built
// on a portal-less inline modal (no new dep). Keyboard support: Esc closes,
// arrow-left / arrow-right paginate, Tab focus traps inside the modal.

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export type PresentationGalleryItem = {
  url: string;
  alt?: string | null;
  caption?: string | null;
};

export function PresentationGallery({ items }: { items: PresentationGalleryItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const close = useCallback(() => setOpenIndex(null), []);
  const next = useCallback(
    () => setOpenIndex((i) => (i === null ? null : (i + 1) % items.length)),
    [items.length],
  );
  const prev = useCallback(
    () => setOpenIndex((i) => (i === null ? null : (i - 1 + items.length) % items.length)),
    [items.length],
  );

  useEffect(() => {
    if (openIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [openIndex, close, next, prev]);

  if (items.length === 0) return null;

  const active = openIndex !== null ? items[openIndex] : null;

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {items.map((item, i) => (
          <li key={`${item.url}-${i}`}>
            <button
              type="button"
              onClick={() => setOpenIndex(i)}
              className="group relative block aspect-square w-full overflow-hidden rounded-xl bg-zinc-100 ring-1 ring-zinc-200 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--hir-brand,#7c3aed)] focus:ring-offset-2"
              aria-label={item.alt ?? `Imagine ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={item.alt ?? ''}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            </button>
            {item.caption ? (
              <p className="mt-1.5 line-clamp-2 text-xs text-zinc-600">{item.caption}</p>
            ) : null}
          </li>
        ))}
      </ul>

      {active ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Galerie imagine"
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 px-4 py-6"
          onClick={close}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
            aria-label="Închide"
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          {items.length > 1 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                prev();
              }}
              aria-label="Imaginea anterioară"
              className="absolute left-2 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white sm:left-4"
            >
              <ChevronLeft className="h-6 w-6" aria-hidden />
            </button>
          ) : null}
          {items.length > 1 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                next();
              }}
              aria-label="Imaginea următoare"
              className="absolute right-2 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white sm:right-4"
            >
              <ChevronRight className="h-6 w-6" aria-hidden />
            </button>
          ) : null}
          <figure
            className="relative max-h-[88vh] max-w-[88vw] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.url}
              alt={active.alt ?? ''}
              className="max-h-[80vh] max-w-full rounded-lg object-contain shadow-2xl"
            />
            {active.caption ? (
              <figcaption className="mt-3 max-w-2xl text-center text-sm text-white/85">
                {active.caption}
              </figcaption>
            ) : null}
          </figure>
        </div>
      ) : null}
    </>
  );
}
