// Lane MARKETING-POLISH-V4B (2026-05-16) — unit tests for the marketing
// JSON-LD helpers used by /pricing + /orase.

import { describe, expect, it } from 'vitest';
import {
  pricingFaqJsonLd,
  pricingProductJsonLd,
  breadcrumbJsonLd,
} from './structured-data';

describe('pricingFaqJsonLd', () => {
  const ld = pricingFaqJsonLd();

  it('emits FAQPage @type', () => {
    expect(ld['@type']).toBe('FAQPage');
    expect(ld['@context']).toBe('https://schema.org');
  });

  it('wraps each question in Question + Answer shape', () => {
    expect(ld.mainEntity.length).toBeGreaterThanOrEqual(5);
    for (const entry of ld.mainEntity) {
      expect(entry['@type']).toBe('Question');
      expect(typeof entry.name).toBe('string');
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.acceptedAnswer['@type']).toBe('Answer');
      expect(typeof entry.acceptedAnswer.text).toBe('string');
      expect(entry.acceptedAnswer.text.length).toBeGreaterThan(0);
    }
  });
});

describe('pricingProductJsonLd', () => {
  const ld = pricingProductJsonLd({
    url: 'https://hirforyou.ro/pricing',
    imageUrl: 'https://hirforyou.ro/og.png',
  });

  it('emits Product @type without a published price (subscription figure not locked yet)', () => {
    expect(ld['@type']).toBe('Product');
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld.url).toBe('https://hirforyou.ro/pricing');
    expect(ld).not.toHaveProperty('offers');
  });

  it('omits image when not provided', () => {
    const noImage = pricingProductJsonLd({ url: 'https://hirforyou.ro/pricing' });
    expect(noImage.image).toBeUndefined();
  });
});

describe('breadcrumbJsonLd', () => {
  const ld = breadcrumbJsonLd('https://hirforyou.ro', [
    { name: 'Acasă', path: '/' },
    { name: 'Tarife', path: '/pricing' },
  ]);

  it('emits BreadcrumbList with positional ListItem entries', () => {
    expect(ld['@type']).toBe('BreadcrumbList');
    expect(ld.itemListElement).toHaveLength(2);
    expect(ld.itemListElement[0]).toMatchObject({
      '@type': 'ListItem',
      position: 1,
      name: 'Acasă',
      item: 'https://hirforyou.ro/',
    });
    expect(ld.itemListElement[1]).toMatchObject({
      position: 2,
      item: 'https://hirforyou.ro/pricing',
    });
  });
});
