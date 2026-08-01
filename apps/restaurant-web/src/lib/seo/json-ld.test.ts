// Lane MARKETING-POLISH-V4B (2026-05-16) — unit tests for the marketing
// JSON-LD helpers used across marketing routes.

import { describe, expect, it } from 'vitest';
import { breadcrumbJsonLd } from './structured-data';

describe('breadcrumbJsonLd', () => {
  const ld = breadcrumbJsonLd('https://hirforyou.ro', [
    { name: 'Acasă', path: '/' },
    { name: 'Cum funcționează', path: '/cum-functioneaza' },
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
      item: 'https://hirforyou.ro/cum-functioneaza',
    });
  });
});
