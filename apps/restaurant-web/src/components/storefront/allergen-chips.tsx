import { allergensFor, parseAllergens } from '@hir/ui';
import type { Locale } from '@/lib/i18n';

// Allergen chips for a menu item card.
//
// 2026-08-03 — these used to be emoji only, with the allergen's name available
// solely through `title` and an `sr-only` span. Iulian, looking at the demo:
// "nu apar alergenii". They were there — as two 16px yellow pills showing a
// wheat ear and a glass of milk, which nobody reads as "gluten" and "lapte".
//
// That is also the weaker reading of EU 1169/2011 art. 14: the information has
// to reach the consumer *before* they buy, and the "+" button adds straight to
// the cart. `title` is a hover tooltip, and hover does not exist on a phone —
// which is where nearly all of these orders are placed. So the name is now
// visible text.
//
// Shared by the real storefront card and the marketing demo on purpose: those
// two had already drifted once on the category tiles, and the demo showing less
// than the product is the wrong way round.
export function AllergenChips({
  codes,
  locale,
  label,
}: {
  codes: string[];
  locale: Locale;
  /** Accessible name for the list, e.g. t(locale, 'item.allergens_title'). */
  label: string;
}) {
  // parseAllergens rather than a cast: the codes come out of a jsonb column, so
  // an unknown or misspelled one is possible and should be dropped, not crash.
  const known = allergensFor(parseAllergens(codes));
  if (known.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-1" aria-label={label}>
      {known.map((a) => (
        <li
          key={a.code}
          className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium leading-none text-amber-900 ring-1 ring-inset ring-amber-200"
        >
          <span aria-hidden>{a.emoji}</span>
          {locale === 'en' ? a.en : a.ro}
        </li>
      ))}
    </ul>
  );
}
