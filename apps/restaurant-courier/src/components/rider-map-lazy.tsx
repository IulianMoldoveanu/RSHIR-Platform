'use client';

import nextDynamic from 'next/dynamic';

// Client wrapper around RiderMap so `nextDynamic({ ssr: false })` is legal
// (Next 15 disallows `ssr: false` inside Server Components). The dashboard
// page is async/server-rendered; it imports this thin client component
// instead of calling nextDynamic directly.
//
// Lazy-loading keeps Leaflet (~200KB gzipped on CDN) + leaflet-rotate off
// the initial JS bundle so the dashboard renders even on slow 3G; the map
// container shows a tinted skeleton while the runtime fetches the chunk.
const RiderMap = nextDynamic(
  () => import('@/components/rider-map').then((m) => ({ default: m.RiderMap })),
  {
    ssr: false,
    // Branded skeleton: dark gradient tinted with violet so the loading state
    // looks intentional instead of a blank gray box. Subtle grid hint at the
    // edges so the user perceives "this is a map" without actually rendering
    // tiles. The animated pulse on the centre pill mirrors the "live" pulse
    // on the rider pin once the map is ready.
    loading: () => (
      <div
        className="relative h-full w-full overflow-hidden bg-zinc-950"
        role="status"
        aria-label="Se încarcă harta…"
      >
        {/* Background gradient */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 30% 25%, rgba(124,58,237,0.18), transparent 55%), radial-gradient(ellipse at 70% 75%, rgba(124,58,237,0.10), transparent 60%), #0b0420',
          }}
        />
        {/* Faint grid suggesting a map */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'linear-gradient(rgba(167,139,250,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(167,139,250,0.18) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage:
              'radial-gradient(ellipse at center, black 30%, transparent 70%)',
          }}
        />
        {/* Centre pulse to mirror the real rider pin */}
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 animate-ping rounded-full bg-violet-500/40" />
            <div className="absolute inset-2 rounded-full bg-violet-500/80 shadow-[0_0_18px_rgba(124,58,237,0.6)]" />
          </div>
          <p className="rounded-full border border-zinc-700 bg-zinc-950/85 px-3 py-1.5 text-[11px] font-medium text-zinc-300 backdrop-blur">
            Se încarcă harta…
          </p>
        </div>
      </div>
    ),
  },
);

export type RiderMapLazyProps = React.ComponentProps<typeof RiderMap>;

export function RiderMapLazy(props: RiderMapLazyProps) {
  return <RiderMap {...props} />;
}
