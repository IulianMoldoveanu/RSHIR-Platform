import { describe, expect, test } from 'vitest';
import { Drumstick, Egg, Pizza, Popcorn, Salad, Sandwich, Soup, UtensilsCrossed, CupSoda } from 'lucide-react';
import {
  ACTIVE_TILE_STYLE,
  accentForCategory,
  iconForCategory,
  tileStyleForCategory,
} from './category-icon';

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

describe('accentForCategory', () => {
  test('gives different categories visually distinct ink colours', () => {
    const pizza = accentForCategory('Pizza');
    const salad = accentForCategory('Salată');
    const soup = accentForCategory('Supe');
    expect(pizza).not.toBe(salad);
    expect(salad).not.toBe(soup);
    expect(pizza).not.toBe(soup);
  });

  test('every accent is a well-formed 6-digit hex', () => {
    for (const name of ['Pizza', 'Supe', 'Băuturi', 'Salate', 'xyz necunoscut']) {
      expect(accentForCategory(name)).toMatch(HEX_RE);
    }
  });

  test('falls back to neutral zinc for unknown categories', () => {
    expect(accentForCategory('xyz complet necunoscut')).toBe('#52525B');
  });

  test('is deterministic — same name always resolves to the same accent', () => {
    expect(accentForCategory('Pizza')).toBe(accentForCategory('pizza'));
  });
});

describe('tileStyleForCategory', () => {
  // The unselected tile is a white card, not a filled colour block: a wash and
  // an outline derived from the category's own hue. Iulian rejected the old
  // full-gradient tiles as unprofessional, so a regression back to a saturated
  // fill is worth catching here.
  test('is a translucent wash of the accent, not an opaque fill', () => {
    const style = tileStyleForCategory('Pizza');
    const accent = accentForCategory('Pizza');
    expect(style.background).toBe(`${accent}0A`);
    expect(style.borderColor).toBe(`${accent}47`);
    expect(style.background).not.toContain('gradient');
  });

  test('different categories get different washes', () => {
    expect(tileStyleForCategory('Pizza').background).not.toBe(
      tileStyleForCategory('Supe').background,
    );
  });

  test('is deterministic — same name always resolves to the same style', () => {
    expect(tileStyleForCategory('Pizza')).toEqual(tileStyleForCategory('pizza'));
  });
});

describe('ACTIVE_TILE_STYLE', () => {
  test('uses the tenant brand CSS variable with a purple fallback', () => {
    expect(ACTIVE_TILE_STYLE.background).toContain('var(--hir-brand, #7c3aed)');
  });
});
