'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';

// The identity row of the demo storefront: logo + name, plus the one piece of
// demo-only chrome on it — a slot the visitor can drop their *own* logo into.
//
// Iulian, 2026-08-04: "nu vreau sa ii dai un logo real in loc de poza de profil
// la restaurantul demo. vreau sa ii adaugi un loc unde poate sa isi puna
// propriul logo." So the demo tenant keeps the picture it ships with, and this
// adds the affordance next to it. A restaurant owner clicking through the demo
// sees their own brand on the storefront in two taps, which is a far stronger
// argument than any copy about "storefront cu brandul tău".
//
// This is a preview, not an upload. The file is turned into an object URL and
// rendered locally; nothing is sent anywhere, there is no tenant to save it to,
// and it is gone on refresh. The real thing lives in the admin app at
// Setări → Branding (upload to Supabase storage → settings.branding.logo_url),
// which then renders in exactly this slot via tenant-header.tsx.
//
// Same 4 MB cap and accepted types as that admin form, so what works here works
// there.

const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml';

export function DemoLogoSlot({ logoUrl, name }: { logoUrl: string | null; name: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [custom, setCustom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Object URLs live until revoked. Cleaning up in the effect (rather than in
  // the setter) means the *previous* URL is released whenever `custom` changes
  // and the last one is released on unmount — someone trying five logos leaves
  // no blobs behind.
  useEffect(() => {
    if (!custom) return;
    return () => URL.revokeObjectURL(custom);
  }, [custom]);

  function pick(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Alege un fișier imagine.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Fișierul depășește 4 MB.');
      return;
    }
    setError(null);
    setCustom(URL.createObjectURL(file));
  }

  const src = custom ?? logoUrl;

  return (
    <>
      {/* relative z-10: the cover above has `relative` positioning, which
          (even with z-index:auto) paints above static in-flow siblings —
          without this, the cover clipped the top of the logo wherever the
          pull-up made them overlap.
          The pull-up belongs on the logo alone, not on this row: on the row it
          dragged the tenant name up over the cover photo too — dark text on a
          dark photo, unreadable. Same as the real storefront header. */}
      <div className="relative z-10 flex items-end gap-3 sm:gap-4">
        {/* Logo at the real header's size (80/112px, 4px white ring, pulled up
            over the cover). This is the single most brand-carrying element on a
            storefront — a prospect looking at the demo has to see where their
            own logo goes. */}
        <div className="relative -mt-12 shrink-0 sm:-mt-14">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-white shadow-md sm:h-28 sm:w-28">
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={custom ? 'Logo-ul tău' : name}
                className="h-full w-full object-cover"
                loading="eager"
              />
            ) : (
              <span className="text-2xl font-bold tracking-tight text-zinc-900">
                {name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              // Reset so picking the same file twice still fires `change`.
              e.target.value = '';
            }}
          />

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            title="Imaginea rămâne în browserul tău — nu se încarcă nicăieri."
            className="absolute -bottom-2 -right-2 inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-700 shadow-md transition-colors hover:border-zinc-300 hover:text-zinc-900 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hir-brand,#7c3aed)]"
          >
            <ImagePlus className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">{custom ? 'Schimbă' : 'Logo-ul tău'}</span>
            <span className="sr-only sm:hidden">
              {custom ? 'Schimbă logo-ul' : 'Pune logo-ul tău'}
            </span>
          </button>

          {custom && (
            <button
              type="button"
              onClick={() => setCustom(null)}
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-md transition-colors hover:text-zinc-900"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Renunță la logo-ul tău</span>
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1 pb-1">
          <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
            {name}
          </h1>
        </div>
      </div>

      {(custom || error) && (
        <p
          className={`mt-3 text-[11px] leading-relaxed ${
            error ? 'text-rose-600' : 'text-zinc-500'
          }`}
        >
          {error ??
            'Așa arată storefront-ul cu logo-ul tău. Este doar o previzualizare — imaginea nu pleacă din browserul tău. Pe contul tău, îl încarci o dată din Setări → Branding și rămâne acolo.'}
        </p>
      )}
    </>
  );
}
