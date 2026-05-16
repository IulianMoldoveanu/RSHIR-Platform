'use client';

import nextDynamic from 'next/dynamic';

// Client wrapper around RiderMap so `nextDynamic({ ssr: false })` is legal
// (Next 15 disallows `ssr: false` inside Server Components). The dashboard
// page is async/server-rendered; it imports this thin client component
// instead of calling nextDynamic directly.
const RiderMap = nextDynamic(
  () => import('@/components/rider-map').then((m) => ({ default: m.RiderMap })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full animate-pulse bg-zinc-900" aria-label="Se încarcă harta…" />
    ),
  },
);

export type RiderMapLazyProps = React.ComponentProps<typeof RiderMap>;

export function RiderMapLazy(props: RiderMapLazyProps) {
  return <RiderMap {...props} />;
}
