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
    loading: () => (
      <div
        className="h-full w-full animate-pulse bg-hir-surface"
        aria-label="Se încarcă harta…"
      />
    ),
  },
);

export type RiderMapLazyProps = React.ComponentProps<typeof RiderMap>;

export function RiderMapLazy(props: RiderMapLazyProps) {
  return <RiderMap {...props} />;
}
