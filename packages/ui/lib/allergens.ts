// The 14 allergens that must be declared for food sold at a distance.
//
// Source: Regulamentul (UE) nr. 1169/2011, Anexa II. Article 14 requires the
// mandatory food information — allergens included — to be available to the
// consumer *before* the purchase is concluded and without extra charge, which
// for an online menu means on the item itself, not on a PDF the customer has
// to ask for.
//
// This list is fixed by law: it does not vary by tenant, by city or by
// vertical, and it has changed once since 2011 (sesame's scope). Treat it as a
// constant, not as configuration — no tenant should be able to edit the
// catalogue, only tick which entries apply to a given dish.
//
// Lives in @hir/ui because both the storefront (restaurant-web, which renders
// them) and the dashboard (restaurant-admin, where the owner ticks them) need
// the identical set, and @hir/ui is the one workspace package both already
// depend on that needs no build step.

export type AllergenCode =
  | 'gluten'
  | 'crustacee'
  | 'oua'
  | 'peste'
  | 'arahide'
  | 'soia'
  | 'lapte'
  | 'nuci'
  | 'telina'
  | 'mustar'
  | 'susan'
  | 'sulfiti'
  | 'lupin'
  | 'moluste';

export type Allergen = {
  code: AllergenCode;
  /** Romanian label — the authoritative one for RO storefronts. */
  ro: string;
  /** English label for EN storefronts. */
  en: string;
  /** Single glyph shown on compact chips. */
  emoji: string;
};

export const ALLERGENS: ReadonlyArray<Allergen> = [
  { code: 'gluten', ro: 'Gluten', en: 'Gluten', emoji: '🌾' },
  { code: 'crustacee', ro: 'Crustacee', en: 'Crustaceans', emoji: '🦐' },
  { code: 'oua', ro: 'Ouă', en: 'Eggs', emoji: '🥚' },
  { code: 'peste', ro: 'Pește', en: 'Fish', emoji: '🐟' },
  { code: 'arahide', ro: 'Arahide', en: 'Peanuts', emoji: '🥜' },
  { code: 'soia', ro: 'Soia', en: 'Soy', emoji: '🫘' },
  { code: 'lapte', ro: 'Lapte', en: 'Milk', emoji: '🥛' },
  { code: 'nuci', ro: 'Nuci', en: 'Tree nuts', emoji: '🌰' },
  { code: 'telina', ro: 'Țelină', en: 'Celery', emoji: '🥬' },
  { code: 'mustar', ro: 'Muștar', en: 'Mustard', emoji: '🌭' },
  { code: 'susan', ro: 'Susan', en: 'Sesame', emoji: '🫓' },
  { code: 'sulfiti', ro: 'Sulfiți', en: 'Sulphites', emoji: '🍷' },
  { code: 'lupin', ro: 'Lupin', en: 'Lupin', emoji: '🌱' },
  { code: 'moluste', ro: 'Moluște', en: 'Molluscs', emoji: '🦪' },
];

const BY_CODE = new Map(ALLERGENS.map((a) => [a.code, a]));

export function isAllergenCode(value: unknown): value is AllergenCode {
  return typeof value === 'string' && BY_CODE.has(value as AllergenCode);
}

/**
 * Keeps only codes this regulation actually defines, de-duplicated and in the
 * catalogue's own order so two dishes with the same allergens always render
 * the same chips in the same sequence. Anything unrecognised is dropped rather
 * than shown: an allergen label the customer can't act on is worse than none.
 */
export function parseAllergens(value: unknown): AllergenCode[] {
  if (!Array.isArray(value)) return [];
  const picked = new Set<AllergenCode>();
  for (const raw of value) {
    const code = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (isAllergenCode(code)) picked.add(code);
  }
  return ALLERGENS.filter((a) => picked.has(a.code)).map((a) => a.code);
}

export function allergenLabel(code: AllergenCode, locale: 'ro' | 'en' = 'ro'): string {
  const a = BY_CODE.get(code);
  if (!a) return code;
  return locale === 'en' ? a.en : a.ro;
}

export function allergensFor(codes: ReadonlyArray<AllergenCode>): Allergen[] {
  return ALLERGENS.filter((a) => codes.includes(a.code));
}
