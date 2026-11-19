import { describe, expect, test } from 'vitest';
import { formatLatLng, parseLatLng } from './coords';

describe('parseLatLng', () => {
  test('accepts the pair Google Maps copies on right-click', () => {
    expect(parseLatLng('45.6303406, 25.6234782')).toEqual({
      lat: 45.6303406,
      lng: 25.6234782,
    });
  });

  test('accepts space, semicolon and wrapping parentheses', () => {
    expect(parseLatLng('45.63 25.62')).toEqual({ lat: 45.63, lng: 25.62 });
    expect(parseLatLng('45.63;25.62')).toEqual({ lat: 45.63, lng: 25.62 });
    expect(parseLatLng('(45.63, 25.62)')).toEqual({ lat: 45.63, lng: 25.62 });
  });

  test('accepts negative coordinates', () => {
    expect(parseLatLng('-33.8688, 151.2093')).toEqual({ lat: -33.8688, lng: 151.2093 });
  });

  test('refuses a single number — half a pin is worse than none', () => {
    expect(parseLatLng('45.63')).toBeNull();
  });

  test('refuses three numbers and free text', () => {
    expect(parseLatLng('45.63, 25.62, 10')).toBeNull();
    expect(parseLatLng('Str. Republicii 12')).toBeNull();
    expect(parseLatLng('')).toBeNull();
  });

  test('refuses out-of-range values, so a swapped pair cannot be saved', () => {
    // 151 is a valid longitude but not a valid latitude: Sydney pasted
    // lng-first lands in the Pacific and would be accepted without this.
    expect(parseLatLng('151.2093, -33.8688')).toBeNull();
    expect(parseLatLng('45.63, 200')).toBeNull();
  });

  test('formats to six decimals', () => {
    expect(formatLatLng({ lat: 45.6303406, lng: 25.6234782 })).toBe('45.630341, 25.623478');
    expect(formatLatLng({ lat: 45, lng: 25 })).toBe('45.000000, 25.000000');
  });
});
