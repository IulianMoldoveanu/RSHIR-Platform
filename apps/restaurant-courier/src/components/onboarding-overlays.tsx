'use client';

import nextDynamic from 'next/dynamic';

// Lazy-load the three first-run overlays so their code (framer-motion
// AnimatePresence wrappers, multi-screen carousels, etc.) is fetched
// only when needed and never on the critical path for returning
// couriers. Each overlay checks LocalStorage on mount before rendering;
// before this PR, that check still happened but the JS was already in
// the initial bundle. After this PR, the chunks load post-paint.
//
// ssr:false is required because each component reads window/localStorage
// during render. The dashboard layout is async (server), so we wrap
// nextDynamic in this thin client component and import only this one
// from the layout.

const WelcomeCarousel = nextDynamic(
  () => import('@/components/welcome-carousel').then((m) => ({ default: m.WelcomeCarousel })),
  { ssr: false, loading: () => null },
);

const FirstShiftTutorial = nextDynamic(
  () =>
    import('@/components/first-shift-tutorial').then((m) => ({
      default: m.FirstShiftTutorial,
    })),
  { ssr: false, loading: () => null },
);

const WhatsNewBanner = nextDynamic(
  () => import('@/components/whats-new-banner').then((m) => ({ default: m.WhatsNewBanner })),
  { ssr: false, loading: () => null },
);

export function OnboardingOverlays() {
  return (
    <>
      <WelcomeCarousel />
      <FirstShiftTutorial />
      <WhatsNewBanner />
    </>
  );
}
