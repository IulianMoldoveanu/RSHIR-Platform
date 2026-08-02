import { describe, expect, test } from 'vitest';
import {
  ACTIVE_TILE_STYLE,
  accentForCategory,
  iconForCategory,
  tileStyleForCategory,
} from './category-icon';
import { FOOD_ICON_SHAPES } from './food-icons';

describe('iconForCategory', () => {
  test('matches known RO category names', () => {
    expect(iconForCategory('Pizza')).toBe('pizza');
    expect(iconForCategory('Burgeri')).toBe('burger');
    expect(iconForCategory('Supe')).toBe('soup');
    expect(iconForCategory('Băuturi')).toBe('drink');
  });

  test('matches multi-brand cloud-kitchen categories (Delivery House brands)', () => {
    // Chicken Press / Egg & Smash House style category names — these were
    // missing before and fell through to the generic fallback glyph.
    expect(iconForCategory('Pui la grătar')).toBe('chicken');
    expect(iconForCategory('Chicken Wings')).toBe('chicken');
    expect(iconForCategory('Ouă & Smash')).toBe('egg');
    expect(iconForCategory('Cartofi prăjiți')).toBe('fries');
  });

  test('matches RO plural and inflected forms, not just the singular stem', () => {
    // Regression: keywords must be stems ("sup", "salat", "vegetar"), not full
    // words — RO plurals don't contain the singular as a substring, and
    // "Vegetariene" contains neither "vegetarian" nor "vegana".
    expect(iconForCategory('Supe')).toBe('soup');
    expect(iconForCategory('Salate')).toBe('salad');
    expect(iconForCategory('Preparate Vegetariene')).toBe('salad');
    expect(iconForCategory('Vegetarian')).toBe('salad');
  });

  test('is diacritics-insensitive', () => {
    expect(iconForCategory('Bauturi')).toBe('drink');
    expect(iconForCategory('Ciorbă')).toBe('soup');
  });

  test('is case-insensitive', () => {
    expect(iconForCategory('PIZZA')).toBe('pizza');
  });

  test('falls back to a generic glyph for unknown categories', () => {
    expect(iconForCategory('Categorie complet aleatorie xyz')).toBe('cutlery');
    expect(iconForCategory('')).toBe('cutlery');
  });

  test('every name it can return is actually drawn', () => {
    // A typo in the keyword table would otherwise render an empty <svg>.
    const names = [
      'Pizza', 'Pui', 'Ouă', 'Burgeri', 'Cartofi', 'Supe', 'Salate', 'Grătar',
      'Pește', 'Mic dejun', 'Paste', 'Brânzeturi', 'Băuturi', 'Înghețată',
      'Prăjituri', 'Sosuri picante', 'Noutăți', 'Healthy', 'xyz',
    ];
    for (const n of names) {
      expect(FOOD_ICON_SHAPES[iconForCategory(n)]?.length).toBeGreaterThan(0);
    }
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
