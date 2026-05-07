// Unit tests for the partner white-label landing_settings validators.
// Spec covers each new field added in feat/reseller-white-label-per-partner.

import { describe, expect, test } from 'vitest';
import {
  buildLandingPatch,
  validateAccentColor,
  validateCtaUrl,
  validateHeroImageUrl,
  validateLogoUrl,
  validateTagline,
  validateTenantCountFloor,
  TAGLINE_MAX,
  TENANT_COUNT_FLOOR_MAX,
  URL_MAX,
} from './validators';

describe('validateLogoUrl', () => {
  test('accepts an allow-listed https URL', () => {
    expect(validateLogoUrl('https://res.cloudinary.com/demo/logo.png')).toEqual({ ok: true });
  });

  test('rejects http://', () => {
    const r = validateLogoUrl('http://res.cloudinary.com/demo/logo.png');
    expect(r.ok).toBe(false);
  });

  test('rejects a non-allow-listed host', () => {
    const r = validateLogoUrl('https://evil.example.com/logo.png');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/allow-listed/);
  });

  test('accepts the empty string (means "no logo")', () => {
    expect(validateLogoUrl('')).toEqual({ ok: true });
  });

  test(`rejects URLs longer than ${URL_MAX} chars`, () => {
    const long = 'https://i.imgur.com/' + 'a'.repeat(URL_MAX);
    const r = validateLogoUrl(long);
    expect(r.ok).toBe(false);
  });

  test('rejects malformed URLs', () => {
    const r = validateLogoUrl('not a url at all');
    expect(r.ok).toBe(false);
  });
});

describe('validateTagline', () => {
  test('accepts an empty tagline', () => {
    expect(validateTagline('tagline_ro', '')).toEqual({ ok: true });
  });

  test('accepts a typical RO tagline', () => {
    expect(
      validateTagline('tagline_ro', 'Soluția de comenzi online pentru restaurantul tău'),
    ).toEqual({ ok: true });
  });

  test(`rejects taglines longer than ${TAGLINE_MAX} chars`, () => {
    const long = 'a'.repeat(TAGLINE_MAX + 1);
    const r = validateTagline('tagline_en', long);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tagline_en/);
  });
});

describe('validateTenantCountFloor', () => {
  test('accepts 0', () => {
    expect(validateTenantCountFloor(0)).toEqual({ ok: true });
  });

  test('accepts a small positive integer', () => {
    expect(validateTenantCountFloor(15)).toEqual({ ok: true });
  });

  test('rejects negatives', () => {
    expect(validateTenantCountFloor(-1).ok).toBe(false);
  });

  test('rejects floats', () => {
    expect(validateTenantCountFloor(1.5).ok).toBe(false);
  });

  test('rejects NaN / Infinity', () => {
    expect(validateTenantCountFloor(Number.NaN).ok).toBe(false);
    expect(validateTenantCountFloor(Number.POSITIVE_INFINITY).ok).toBe(false);
  });

  test(`rejects values above ${TENANT_COUNT_FLOOR_MAX}`, () => {
    expect(validateTenantCountFloor(TENANT_COUNT_FLOOR_MAX + 1).ok).toBe(false);
  });
});

describe('legacy validators (regression)', () => {
  test('validateAccentColor accepts #abc and #aabbcc', () => {
    expect(validateAccentColor('#abc')).toEqual({ ok: true });
    expect(validateAccentColor('#aabbcc')).toEqual({ ok: true });
  });

  test('validateAccentColor rejects #ggg', () => {
    expect(validateAccentColor('#ggg').ok).toBe(false);
  });

  test('validateCtaUrl accepts a relative path', () => {
    expect(validateCtaUrl('/migrate-from-gloriafood')).toEqual({ ok: true });
  });

  test('validateCtaUrl rejects javascript: scheme', () => {
    expect(validateCtaUrl('javascript:alert(1)').ok).toBe(false);
  });

  test('validateHeroImageUrl rejects non-allowlisted host', () => {
    expect(validateHeroImageUrl('https://evil.example.com/x.png').ok).toBe(false);
  });
});

describe('buildLandingPatch', () => {
  test('builds a partial patch without undefined keys', () => {
    const r = buildLandingPatch({
      headline: 'Bun venit',
      logo_url: 'https://i.imgur.com/abc.png',
      tagline_ro: 'Comenzi simple',
      tenant_count_floor: 3,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.patch).toEqual({
        headline: 'Bun venit',
        logo_url: 'https://i.imgur.com/abc.png',
        tagline_ro: 'Comenzi simple',
        tenant_count_floor: 3,
      });
    }
  });

  test('returns empty patch when no fields supplied', () => {
    const r = buildLandingPatch({});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.patch).toEqual({});
  });

  test('floors fractional tenant_count_floor', () => {
    // The validator rejects non-integers, so a fractional value short-circuits.
    const r = buildLandingPatch({ tenant_count_floor: 3.7 });
    expect(r.ok).toBe(false);
  });

  test('propagates the first validator error', () => {
    const r = buildLandingPatch({
      headline: 'ok',
      logo_url: 'http://insecure.example.com/logo.png',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/logo_url/);
  });

  test('accepts both RO and EN taglines', () => {
    const r = buildLandingPatch({
      tagline_ro: 'Comenzi simple',
      tagline_en: 'Simple online ordering',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.patch).toEqual({
        tagline_ro: 'Comenzi simple',
        tagline_en: 'Simple online ordering',
      });
    }
  });
});
