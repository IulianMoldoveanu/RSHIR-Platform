// EN parity guard for the admin help center.
//
// Each topic must have RO + EN strings for every localized field, no empty
// strings, and matching structural shape (same number of steps, same set
// of optional fields). `pickLocale` must return the right language and
// fall back to RO when EN is missing.

import { describe, it, expect } from 'vitest';
import {
  HELP_CATEGORIES,
  getAllTopics,
  pickLocale,
  type L10n,
  type Localized,
} from './content';

function isLocalized(v: L10n): v is Localized {
  return typeof v === 'object' && v !== null && 'ro' in v && 'en' in v;
}

function assertLocalized(v: L10n, where: string) {
  expect(isLocalized(v), `${where} must be a {ro,en} object, got: ${typeof v === 'string' ? 'string' : 'unknown'}`).toBe(true);
  if (isLocalized(v)) {
    expect(v.ro.trim().length, `${where}.ro must be non-empty`).toBeGreaterThan(0);
    expect(v.en.trim().length, `${where}.en must be non-empty`).toBeGreaterThan(0);
  }
}

describe('help content: EN parity', () => {
  it('has at least one category with topics', () => {
    expect(HELP_CATEGORIES.length).toBeGreaterThan(0);
    expect(getAllTopics().length).toBeGreaterThan(0);
  });

  it('every category title + description is bilingual', () => {
    for (const cat of HELP_CATEGORIES) {
      assertLocalized(cat.title, `category[${cat.slug}].title`);
      assertLocalized(cat.description, `category[${cat.slug}].description`);
    }
  });

  it('every topic field is bilingual + non-empty', () => {
    for (const cat of HELP_CATEGORIES) {
      for (const t of cat.topics) {
        const where = `topic[${cat.slug}/${t.slug}]`;
        assertLocalized(t.title, `${where}.title`);
        assertLocalized(t.summary, `${where}.summary`);
        assertLocalized(t.intro, `${where}.intro`);
        if (t.outro !== undefined) assertLocalized(t.outro, `${where}.outro`);
        if (t.screenshot !== undefined) assertLocalized(t.screenshot, `${where}.screenshot`);
        if (t.cta !== undefined) assertLocalized(t.cta.label, `${where}.cta.label`);
        for (const [i, step] of (t.steps ?? []).entries()) {
          assertLocalized(step.title, `${where}.steps[${i}].title`);
          assertLocalized(step.body, `${where}.steps[${i}].body`);
        }
      }
    }
  });

  it('topic slug is unique across the whole tree', () => {
    const slugs = getAllTopics().map((t) => t.slug);
    const set = new Set(slugs);
    expect(set.size, 'duplicate topic slug detected').toBe(slugs.length);
  });

  it('every related slug resolves to an existing topic', () => {
    const known = new Set(getAllTopics().map((t) => t.slug));
    for (const t of getAllTopics()) {
      for (const r of t.related ?? []) {
        // Some related slugs point at topics not yet imported (e.g.
        // `exporturi-vanzari` lives in restaurant-web, not here). Allow a
        // small set of cross-app references but flag everything else.
        const CROSS_APP_ALLOWED = new Set(['exporturi-vanzari']);
        if (CROSS_APP_ALLOWED.has(r)) continue;
        expect(known.has(r), `topic ${t.slug} references missing related slug "${r}"`).toBe(true);
      }
    }
  });
});

describe('pickLocale', () => {
  it('returns the right language for a Localized value', () => {
    const v: L10n = { ro: 'salut', en: 'hello' };
    expect(pickLocale(v, 'ro')).toBe('salut');
    expect(pickLocale(v, 'en')).toBe('hello');
  });

  it('returns the bare string unchanged when not localized', () => {
    expect(pickLocale('plain', 'ro')).toBe('plain');
    expect(pickLocale('plain', 'en')).toBe('plain');
  });

  it('falls back to RO when EN is empty', () => {
    const v: L10n = { ro: 'doar ro', en: '' };
    expect(pickLocale(v, 'en')).toBe('doar ro');
  });
});
