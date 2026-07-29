import { describe, expect, test } from 'vitest';
import { normalizePolygon } from './types';

// Mirrors coercePolygon in apps/restaurant-web/src/lib/zones/geo.ts — the
// same three shapes checkout already tolerates must resolve here too, or a
// zone that works fine at checkout silently vanishes from this admin page
// (the actual bug found for Delivery House's ~20km delivery zone).

describe('normalizePolygon', () => {
  const ring: [number, number][] = [
    [25.58, 45.64],
    [25.6, 45.64],
    [25.6, 45.66],
    [25.58, 45.66],
  ];

  test('accepts the canonical nested GeoJSON shape (the draw tool\'s own output)', () => {
    const result = normalizePolygon({ type: 'Polygon', coordinates: [ring] });
    expect(result).toEqual({ type: 'Polygon', coordinates: [ring] });
  });

  test('accepts a bare array of [lng,lat] tuples', () => {
    const result = normalizePolygon(ring);
    expect(result).toEqual({ type: 'Polygon', coordinates: [ring] });
  });

  test('accepts a flat {coordinates:[[lng,lat],...]} shape', () => {
    const result = normalizePolygon({ coordinates: ring });
    expect(result).toEqual({ type: 'Polygon', coordinates: [ring] });
  });

  test('rejects unrecognized shapes instead of throwing', () => {
    expect(normalizePolygon(null)).toBeNull();
    expect(normalizePolygon(undefined)).toBeNull();
    expect(normalizePolygon('not a polygon')).toBeNull();
    expect(normalizePolygon({ coordinates: 'garbage' })).toBeNull();
    expect(normalizePolygon({ foo: 'bar' })).toBeNull();
  });
});
