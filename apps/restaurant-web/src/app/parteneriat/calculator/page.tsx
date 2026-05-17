// /parteneriat/calculator — server wrapper that owns metadata.
// Renders the client-side CalculatorClient (interactive sliders + outputs).
// Split so OG/canonical/hreflang are emitted server-side (Next.js doesn't
// allow `metadata` exports from 'use client' components).

import type { Metadata } from 'next';
import { marketingOgImageUrl } from '@/lib/seo-marketing';
import CalculatorClient from './calculator-client';

const CALC_URL = 'https://hirforyou.ro/parteneriat/calculator';
const CALC_TITLE = 'Calculator câștiguri reseller HIR for You';
const CALC_DESC =
  'Estimează rapid cât poți câștiga aducând restaurante pe HIR for You: direct 25% Y1, override echipă 10% Y1, bonusuri Wave + Ladder. Estimare orientativă, rezultatele variază.';

export const metadata: Metadata = {
  title: CALC_TITLE,
  description: CALC_DESC,
  alternates: {
    canonical: CALC_URL,
    languages: {
      'ro-RO': CALC_URL,
      en: CALC_URL,
      'x-default': CALC_URL,
    },
  },
  openGraph: {
    title: CALC_TITLE,
    description: CALC_DESC,
    url: CALC_URL,
    type: 'website',
    locale: 'ro_RO',
    images: [
      {
        url: marketingOgImageUrl({
          title: 'Calculator câștiguri reseller',
          subtitle: '25% Y1 + 10% override + bonusuri Wave & Ladder',
          variant: 'partner',
        }),
        width: 1200,
        height: 630,
        alt: 'Calculator câștiguri reseller HIR for You',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: CALC_TITLE,
    description: CALC_DESC,
    images: [
      marketingOgImageUrl({
        title: 'Calculator câștiguri reseller',
        subtitle: '25% Y1 + 10% override + bonusuri Wave & Ladder',
        variant: 'partner',
      }),
    ],
  },
  robots: { index: true, follow: true },
};

export default function PublicCalculatorPage() {
  return <CalculatorClient />;
}
