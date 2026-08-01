import { describe, expect, test } from 'vitest';
import { Drumstick, Egg, Pizza, Popcorn, Salad, Sandwich, Soup, UtensilsCrossed, CupSoda } from 'lucide-react';
import { ACTIVE_TILE_STYLE, iconForCategory, tileStyleForCategory } from './category-icon';

describe('iconForCategory', () => {
  test('matches known RO category names', () => {
    expect(iconForCategory('Pizza')).toBe(Pizza);
    expect(iconForCategory('Burgeri')).toBe(Sandwich);
    expect(iconForCategory('Supe')).toBe(Soup);
    expect(iconForCategory('Băuturi')).toBe(CupSoda);
  });

  test('matches multi-brand cloud-kitchen categories (Delivery House brands)', () => {
    // Chicken Press / Egg & Smash House style category names — these were
    // missing before and fell through to the generic fallback glyph.
    expect(iconForCategory('Pui la grătar')).toBe(Drumstick);
    expect(iconForCategory('Chicken Wings')).toBe(Drumstick);
    expect(iconForCategory('Ouă & Smash')).toBe(Egg);
    expect(iconForCategory('Cartofi prăjiți')).toBe(Popcorn);
  });

  test('matches RO plural forms, not just the singular stem', () => {
    // Regression: keywords must be stems ("sup", "salat"), not full singular
    // words ("supa", "salata") — plurals like "Supe"/"Salate" don't contain
    // the singular as a substring.
    expect(iconForCategory('Supe')).toBe(Soup);
    expect(iconForCategory('Salate')).toBe(Salad);
  });

  test('is diacritics-insensitive', () => {
    expect(iconForCategory('Bauturi')).toBe(CupSoda);
    expect(iconForCategory('Ciorbă')).toBe(Soup);
  });

  test('is case-insensitive', () => {
    expect(iconForCategory('PIZZA')).toBe(Pizza);
  });

  test('falls back to a generic glyph for unknown categories', () => {
    expect(iconForCategory('Categorie complet aleatorie xyz')).toBe(UtensilsCrossed);
    expect(iconForCategory('')).toBe(UtensilsCrossed);
  });
});

const HEX_RE = /^#[0-9a-f]{6}$/i;

describe('tileStyleForCategory', () => {
  test('gives different categories visually distinct gradients', () => {
    const pizza = tileStyleForCategory('Pizza');
    const salad = tileStyleForCategory('Salată');
    const soup = tileStyleForCategory('Supe');
    expect(pizza.background).not.toBe(salad.background);
    expect(salad.background).not.toBe(soup.background);
    expect(pizza.background).not.toBe(soup.background);
  });

  test('returns a gradient background and a tinted ambient shadow', () => {
    const style = tileStyleForCategory('Pizza');
    expect(style.background).toContain('linear-gradient(135deg,');
    expect(style.background).toContain('radial-gradient(');
    expect(style.boxShadow).toMatch(/^0 \S+ \S+ -\S+ #[0-9a-f]{6}[0-9a-f]{2}$/i);
  });

  test('gradient stops are well-formed hex colors', () => {
    const style = tileStyleForCategory('Pizza');
    const stops = style.background.match(/linear-gradient\(135deg, (#[0-9a-f]{6}), (#[0-9a-f]{6})\)/i);
    expect(stops).not.toBeNull();
    expect(stops![1]).toMatch(HEX_RE);
    expect(stops![2]).toMatch(HEX_RE);
  });

  test('falls back to a neutral gradient for unknown categories', () => {
    const style = tileStyleForCategory('xyz complet necunoscut');
    expect(style.background).toContain('#A1A1AA');
    expect(style.background).toContain('#52525B');
  });

  test('is deterministic — same name always resolves to the same gradient', () => {
    expect(tileStyleForCategory('Pizza')).toEqual(tileStyleForCategory('pizza'));
  });
});

describe('ACTIVE_TILE_STYLE', () => {
  test('uses the tenant brand CSS variable with a purple fallback', () => {
    expect(ACTIVE_TILE_STYLE.background).toContain('var(--hir-brand, #7c3aed)');
  });
});
