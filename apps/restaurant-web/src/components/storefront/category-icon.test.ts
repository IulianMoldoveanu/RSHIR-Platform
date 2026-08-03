import { describe, expect, test } from 'vitest';
import {
  ACTIVE_TILE_STYLE,
  INACTIVE_TILE_STYLE,
  accentForCategory,
  iconForCategory,
  tileStyleForCategory,
} from './category-icon';
import { FOOD_ICON_BOX, FOOD_ICON_SHAPES, opticalFit, type FoodIconName } from './food-icons';

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

  test('a short stem does not match inside an unrelated word', () => {
    // Caught by rendering the whole strip: "Noutăți" → "noutati" contains "ou",
    // and `egg` is checked before `sparkle`, so a new-items category showed a
    // fried egg. Any keyword short enough to hide inside another word is a bug.
    expect(iconForCategory('Noutăți')).toBe('sparkle');
    expect(iconForCategory('Ouă')).toBe('egg');
    expect(iconForCategory('Ouă & Smash')).toBe('egg');
  });

  test('matches RO derived forms of sweet', () => {
    expect(iconForCategory('Dulciuri')).toBe('cake');
    expect(iconForCategory('Dulce')).toBe('cake');
  });

  test('breakfast keywords resolve to the coffee glyph, including cafea', () => {
    // Renamed from `croissant` 2026-08-03 — the crescent read as a bridge.
    expect(iconForCategory('Mic dejun')).toBe('coffee');
    expect(iconForCategory('Cafea')).toBe('coffee');
    expect(iconForCategory('Patiserie')).toBe('coffee');
  });
});

describe('optical sizing', () => {
  const names = Object.keys(FOOD_ICON_SHAPES) as FoodIconName[];

  test('every drawn glyph has a measured box, and vice versa', () => {
    // A missing box throws at render; a stale extra one is dead data. Both are
    // silent, which is the whole reason this test exists.
    expect(Object.keys(FOOD_ICON_BOX).sort()).toEqual(names.slice().sort());
  });

  test('every box is non-degenerate and inside the 24-unit grid', () => {
    for (const n of names) {
      const [x, y, w, h] = FOOD_ICON_BOX[n];
      expect(w, n).toBeGreaterThan(0);
      expect(h, n).toBeGreaterThan(0);
      expect(x, n).toBeGreaterThanOrEqual(0);
      expect(y, n).toBeGreaterThanOrEqual(0);
      expect(x + w, n).toBeLessThanOrEqual(24);
      expect(y + h, n).toBeLessThanOrEqual(24);
    }
  });

  test('fits every glyph to the same live area and centres it', () => {
    const stroke = 1.6;
    for (const n of names) {
      const [x, y, w, h] = FOOD_ICON_BOX[n];
      const { scale, dx, dy } = opticalFit(n, stroke);

      // Inked extent after fitting: the larger axis lands exactly on 20 units,
      // and neither axis exceeds it. That equality is the point — it's what
      // makes the icons read as one family instead of nineteen sizes.
      const inkedW = (w + stroke) * scale;
      const inkedH = (h + stroke) * scale;
      expect(Math.max(inkedW, inkedH), n).toBeCloseTo(20, 5);
      expect(Math.min(inkedW, inkedH), n).toBeLessThanOrEqual(20 + 1e-9);

      // ...and it sits on the centre of the 24-unit box.
      expect((x + w / 2) * scale + dx, n).toBeCloseTo(12, 5);
      expect((y + h / 2) * scale + dy, n).toBeCloseTo(12, 5);
    }
  });

  test('the stroke stays the same weight on every glyph after fitting', () => {
    // FoodIcon divides strokeWidth by the scale for exactly this reason. If a
    // glyph is shrunk 4% its stroke is drawn 4% thicker, so the rendered line
    // is identical across the set.
    const stroke = 1.6;
    for (const n of names) {
      const { scale } = opticalFit(n, stroke);
      expect((stroke / scale) * scale, n).toBeCloseTo(stroke, 10);
      // Sanity: fitting must never need a wild correction. Anything outside
      // ±25% means a glyph was drawn at the wrong size to begin with.
      expect(scale, n).toBeGreaterThan(0.75);
      expect(scale, n).toBeLessThan(1.25);
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
  // The unselected tile is a plain white card — identical for every category,
  // with all the colour carried by the glyph. Two earlier looks were rejected
  // as unprofessional: full duotone gradient blobs, then a per-category wash
  // behind a per-category coloured hairline, which turned the strip into a row
  // of mismatched pastel boxes. Both regressions are worth catching here.
  test('is a white card, not a colour block', () => {
    const style = tileStyleForCategory('Pizza');
    expect(style.background).toBe('#FFFFFF');
    expect(style.background).not.toContain('gradient');
  });

  test('does not tint the card with the category accent', () => {
    const accent = accentForCategory('Pizza');
    const style = tileStyleForCategory('Pizza');
    expect(style.background).not.toContain(accent);
    expect(style.boxShadow).not.toContain(accent);
  });

  test('is the same card for every category — only the glyph differs', () => {
    expect(tileStyleForCategory('Pizza')).toEqual(tileStyleForCategory('Supe'));
    expect(tileStyleForCategory('Pizza')).toEqual(INACTIVE_TILE_STYLE);
  });

  test('draws its border as an inset shadow so the 64px box is exact', () => {
    // A real 1px border would be subtracted from the content area and leave the
    // glyph half a pixel off centre.
    expect(INACTIVE_TILE_STYLE.boxShadow).toContain('inset 0 0 0 1px');
    expect(INACTIVE_TILE_STYLE).not.toHaveProperty('borderColor');
  });
});

describe('ACTIVE_TILE_STYLE', () => {
  test('uses the tenant brand CSS variable with a purple fallback', () => {
    expect(ACTIVE_TILE_STYLE.background).toContain('var(--hir-brand, #7c3aed)');
  });
});
