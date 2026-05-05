import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import { SalesSheetDocument, type SalesSheetAudience } from './SalesSheetPDF';
import type { SalesSheetStats } from './stats';

// `React` is referenced for the classic JSX transform vitest uses.
void React;

// Lane W — render smoke. We don't snapshot the byte stream (PDF metadata
// includes timestamps, would be flaky); instead we verify (a) the renderer
// returns a non-empty PDF buffer, (b) the buffer starts with the PDF magic
// bytes, (c) all 3 audiences render without throwing — exercises the
// AudienceBlock branch logic.

const stubStats: SalesSheetStats = {
  activeTenants: 12,
  liveCities: 4,
  ordersLast30Days: 1840,
  generatedAt: '2026-05-05T08:00:00.000Z',
};

const audiences: SalesSheetAudience[] = ['fleet-manager', 'restaurant-owner', 'reseller'];

describe('SalesSheetDocument', () => {
  for (const audience of audiences) {
    it(`renders a non-empty PDF for audience=${audience}`, async () => {
      const buf = await renderToBuffer(
        <SalesSheetDocument audience={audience} stats={stubStats} />,
      );
      expect(buf.length).toBeGreaterThan(2000);
      // PDF magic bytes "%PDF" — sanity check the output is actually a PDF.
      expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF');
    }, 30_000);
  }

  it('renders even when stats are null (db unavailable)', async () => {
    const buf = await renderToBuffer(
      <SalesSheetDocument
        audience="fleet-manager"
        stats={{
          activeTenants: null,
          liveCities: null,
          ordersLast30Days: null,
          generatedAt: '2026-05-05T08:00:00.000Z',
        }}
      />,
    );
    expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF');
  }, 30_000);
});
