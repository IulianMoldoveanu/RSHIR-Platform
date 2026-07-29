import { describe, expect, test } from 'vitest';
import { Drumstick, Egg, Pizza, Popcorn, Salad, Sandwich, Soup, UtensilsCrossed, CupSoda } from 'lucide-react';
import { iconForCategory, tileColorForCategory } from './category-icon';

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

describe('tileColorForCategory', () => {
  test('gives different categories visually distinct pastel colors', () => {
    const pizza = tileColorForCategory('Pizza');
    const salad = tileColorForCategory('Salată');
    const soup = tileColorForCategory('Supe');
    expect(pizza).not.toBe(salad);
    expect(salad).not.toBe(soup);
    expect(pizza).not.toBe(soup);
  });

  test('returns both a bg-* and a text-* class', () => {
    const cls = tileColorForCategory('Pizza');
    expect(cls).toMatch(/\bbg-\S+/);
    expect(cls).toMatch(/\btext-\S+/);
  });

  test('falls back to a neutral color for unknown categories', () => {
    expect(tileColorForCategory('xyz complet necunoscut')).toContain('zinc');
  });
});
