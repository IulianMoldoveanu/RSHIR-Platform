// The six-step walkthrough shown on `/cum-functioneaza`, and (first four
// only) on the homepage. One screenshot per step, captured from the live
// apps against the `restaurant-demo` tenant — seeded demo data, never a real
// client's orders. Re-capture with a fresh run if the UI changes; the files
// live in public/guide/.
//
// Dictionary keys are listed literally rather than interpolated so a typo is
// a compile error instead of a blank line in production.

import type { TKey } from '@/lib/i18n';

export type GuideStep = {
  n: number;
  titleKey: TKey;
  bodyKey: TKey;
  /** Path under public/. */
  src: string;
  width: number;
  height: number;
  /** `phone` renders inside a device bezel; `app` in a soft window frame. */
  frame: 'app' | 'phone';
};

export const GUIDE_STEPS: readonly GuideStep[] = [
  {
    n: 1,
    titleKey: 'marketing.guide.step1_title',
    bodyKey: 'marketing.guide.step1_body',
    src: '/guide/admin-setup.webp',
    width: 1280,
    height: 803,
    frame: 'app',
  },
  {
    n: 2,
    titleKey: 'marketing.guide.step2_title',
    bodyKey: 'marketing.guide.step2_body',
    src: '/guide/admin-menu.webp',
    width: 1280,
    height: 769,
    frame: 'app',
  },
  {
    n: 3,
    titleKey: 'marketing.guide.step3_title',
    bodyKey: 'marketing.guide.step3_body',
    src: '/guide/admin-zones.webp',
    width: 1280,
    height: 809,
    frame: 'app',
  },
  {
    n: 4,
    titleKey: 'marketing.guide.step4_title',
    bodyKey: 'marketing.guide.step4_body',
    src: '/guide/store-cart.webp',
    width: 460,
    height: 894,
    frame: 'phone',
  },
  {
    n: 5,
    titleKey: 'marketing.guide.step5_title',
    bodyKey: 'marketing.guide.step5_body',
    src: '/guide/admin-orders.webp',
    width: 1280,
    height: 485,
    frame: 'app',
  },
  {
    n: 6,
    titleKey: 'marketing.guide.step6_title',
    bodyKey: 'marketing.guide.step6_body',
    src: '/guide/courier-map.webp',
    width: 520,
    height: 978,
    frame: 'phone',
  },
] as const;
