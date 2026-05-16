// Lane MARKETING-POLISH-V4B (2026-05-16) — guard that the /pricing route
// inlines FAQPage + Product JSON-LD via the canonical helpers.
//
// We do not boot the React server runtime here (the page imports next/headers
// transitively); instead we run the exact same render path the page uses —
// `safeJsonLd(pricingFaqJsonLd())` + `safeJsonLd(pricingProductJsonLd(...))`
// — and assert the script-safe HTML output contains the FAQPage + Product
// `@type` markers. Drift in the page wiring is caught by Next's typechecker
// (the page imports the exact same helpers); drift in the helpers' shape is
// caught here.

import { describe, expect, it } from 'vitest';
import { safeJsonLd } from '@/lib/jsonld';
import {
  pricingFaqJsonLd,
  pricingProductJsonLd,
} from '@/lib/seo/structured-data';

describe('/pricing JSON-LD render path', () => {
  it('serializes FAQPage @type into script-safe HTML', () => {
    const html = safeJsonLd(pricingFaqJsonLd());
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain('"@type":"Question"');
    expect(html).toContain('"@type":"Answer"');
    // safeJsonLd must escape `<` so the payload can't break out of <script>.
    expect(html).not.toContain('<');
  });

  it('serializes Product @type with Offer + RON pricing', () => {
    const html = safeJsonLd(
      pricingProductJsonLd({
        url: 'https://hirforyou.ro/pricing',
        imageUrl: 'https://hirforyou.ro/og.png',
      }),
    );
    expect(html).toContain('"@type":"Product"');
    expect(html).toContain('"@type":"Offer"');
    expect(html).toContain('"priceCurrency":"RON"');
    expect(html).toContain('"price":"2.00"');
  });
});
