import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RADIUS_KM,
  MAX_RADIUS_KM,
  MIN_RADIUS_KM,
  clampRadius,
} from '../src/lib/auto-accept';

describe('clampRadius', () => {
  it('keeps values inside the range untouched', () => {
    expect(clampRadius(5)).toBe(5);
    expect(clampRadius(MIN_RADIUS_KM)).toBe(MIN_RADIUS_KM);
    expect(clampRadius(MAX_RADIUS_KM)).toBe(MAX_RADIUS_KM);
  });

  it('clamps below MIN_RADIUS_KM', () => {
    expect(clampRadius(0)).toBe(MIN_RADIUS_KM);
    expect(clampRadius(-3)).toBe(MIN_RADIUS_KM);
  });

  it('clamps above MAX_RADIUS_KM', () => {
    expect(clampRadius(50)).toBe(MAX_RADIUS_KM);
  });

  it('rounds to integer km', () => {
    expect(clampRadius(5.7)).toBe(6);
    expect(clampRadius(2.3)).toBe(2);
  });

  it('falls back to default on non-finite input', () => {
    expect(clampRadius(Number.NaN)).toBe(DEFAULT_RADIUS_KM);
    expect(clampRadius(Number.POSITIVE_INFINITY)).toBe(DEFAULT_RADIUS_KM);
  });
});
