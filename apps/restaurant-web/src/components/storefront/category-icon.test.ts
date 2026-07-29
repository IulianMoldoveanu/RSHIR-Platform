import { describe, expect, test } from 'vitest';
import { Pizza, Salad, Sandwich, Soup, UtensilsCrossed, CupSoda } from 'lucide-react';
import { iconForCategory } from './category-icon';

describe('iconForCategory', () => {
  test('matches known RO category names', () => {
    expect(iconForCategory('Pizza')).toBe(Pizza);
    expect(iconForCategory('Burgeri')).toBe(Sandwich);
    expect(iconForCategory('Supe')).toBe(Soup);
    expect(iconForCategory('Băuturi')).toBe(CupSoda);
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
