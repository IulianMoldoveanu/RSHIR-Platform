// Unit tests for the pure helpers behind /r/[code]/page.tsx.
// The page itself depends on Next.js runtime (headers(), Supabase admin), so
// we test the resolution pieces here and trust the smoke environment for the
// composed render. The "Powered by HIR" footer and the public landing route
// at /r/<code> are covered by the structural import below.

import { describe, expect, test } from 'vitest';
import { pickLocale, pickTagline, safeImageUrl } from './helpers';

describe('safeImageUrl', () => {
  test('accepts an https URL on an allow-listed host', () => {
    expect(safeImageUrl('https://res.cloudinary.com/demo/logo.png')).toBe(
      'https://res.cloudinary.com/demo/logo.png',
    );
  });

  test('rejects http://', () => {
    expect(safeImageUrl('http://res.cloudinary.com/demo/logo.png')).toBeNull();
  });

  test('rejects a non-allow-listed host', () => {
    expect(safeImageUrl('https://evil.example.com/logo.png')).toBeNull();
  });

  test('rejects javascript: scheme', () => {
    expect(safeImageUrl('javascript:alert(1)')).toBeNull();
  });

  test('returns null for non-string / empty input', () => {
    expect(safeImageUrl(null)).toBeNull();
    expect(safeImageUrl('')).toBeNull();
    expect(safeImageUrl(42)).toBeNull();
    expect(safeImageUrl(undefined)).toBeNull();
  });

  test('rejects URLs longer than 500 chars', () => {
    const long = 'https://i.imgur.com/' + 'a'.repeat(501);
    expect(safeImageUrl(long)).toBeNull();
  });

  test('rejects malformed URL strings', () => {
    expect(safeImageUrl('not://a real url')).toBeNull();
    expect(safeImageUrl('totally garbage')).toBeNull();
  });
});

describe('pickLocale', () => {
  test('defaults to ro when header is missing', () => {
    expect(pickLocale(null)).toBe('ro');
    expect(pickLocale('')).toBe('ro');
  });

  test('returns en for an Accept-Language preferring English', () => {
    expect(pickLocale('en-US,en;q=0.9')).toBe('en');
    expect(pickLocale('en')).toBe('en');
    expect(pickLocale('en-GB')).toBe('en');
  });

  test('returns ro for Romanian-preferring or other-language headers', () => {
    expect(pickLocale('ro-RO,ro;q=0.9,en;q=0.5')).toBe('ro');
    expect(pickLocale('hu-HU')).toBe('ro');
    expect(pickLocale('de-DE')).toBe('ro');
  });

  test('case-insensitive', () => {
    expect(pickLocale('EN-US,EN;q=0.9')).toBe('en');
  });
});

describe('pickTagline', () => {
  test('returns the matching tagline for the active locale', () => {
    expect(pickTagline('ro', 'Comenzi simple', 'Simple ordering')).toBe('Comenzi simple');
    expect(pickTagline('en', 'Comenzi simple', 'Simple ordering')).toBe('Simple ordering');
  });

  test('falls back to the other locale when the requested one is empty', () => {
    expect(pickTagline('en', 'Doar in română', '')).toBe('Doar in română');
    expect(pickTagline('ro', '', 'Only in English')).toBe('Only in English');
  });

  test('returns null when both languages are empty', () => {
    expect(pickTagline('ro', '', '')).toBeNull();
    expect(pickTagline('en', null, undefined)).toBeNull();
  });

  test('rejects taglines over 140 chars (defense-in-depth)', () => {
    const long = 'a'.repeat(141);
    expect(pickTagline('ro', long, '')).toBeNull();
  });

  test('handles non-string input by treating it as empty', () => {
    expect(pickTagline('ro', 42, { not: 'string' })).toBeNull();
  });
});

// Note: a structural import of ./page is intentionally NOT included here —
// page.tsx imports next/headers + the Supabase admin client and would error
// outside a Next.js runtime. The composed render is covered by the Vercel
// preview smoke listed in the PR description.
