/**
 * Lane I (2026-05-04) — schema.org Restaurant + Menu JSON-LD builders.
 *
 * Google rich results show price / hours / photos / ratings directly in
 * search when the storefront emits a Restaurant block linked to a Menu
 * block. Output is consumed by `safeJsonLd` (escapes `<`/`>`/`&` so a
 * tenant-controlled string can't break out of the script tag).
 */
import type { MenuCategory } from '@/lib/menu';

export type RestaurantJsonLdInput = {
  name: string;
  url: string;
  imageUrl: string | null;
  telephone: string | null;
  cuisine: string | null;
  pickupAddress: string | null;
  rating: { average: number; count: number } | null;
  priceRange?: string;
  hasMenuUrl?: string;
};

export function buildRestaurantJsonLd(input: RestaurantJsonLdInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: input.name,
    image: input.imageUrl ?? undefined,
    url: input.url,
    telephone: input.telephone ?? undefined,
    servesCuisine: input.cuisine ?? undefined,
    priceRange: input.priceRange ?? '$$',
    address: {
      '@type': 'PostalAddress',
      streetAddress: input.pickupAddress ?? undefined,
      addressCountry: 'RO',
    },
    hasMenu: input.hasMenuUrl ?? undefined,
    aggregateRating: input.rating
      ? {
          '@type': 'AggregateRating',
          ratingValue: input.rating.average.toFixed(1),
          reviewCount: input.rating.count,
          bestRating: 5,
          worstRating: 1,
        }
      : undefined,
  };
}

/**
 * Builds a `Menu` with one `MenuSection` per category and one `MenuItem`
 * per available item. Caps at 50 items to keep the JSON-LD payload under
 * Google's ~16KB practical limit even for 158-item tenants like
 * FOISORUL A.
 */
export function buildMenuJsonLd(
  baseUrl: string,
  categories: MenuCategory[],
  cap = 50,
) {
  let remaining = cap;
  const sections = [];
  for (const category of categories) {
    if (remaining <= 0) break;
    const items = [];
    for (const item of category.items) {
      if (remaining <= 0) break;
      if (!item.is_available) continue;
      items.push({
        '@type': 'MenuItem',
        name: item.name,
        description: item.description ?? undefined,
        image: item.image_url ?? undefined,
        offers: {
          '@type': 'Offer',
          price: item.price_ron.toFixed(2),
          priceCurrency: 'RON',
          availability: 'https://schema.org/InStock',
        },
      });
      remaining -= 1;
    }
    if (items.length > 0) {
      sections.push({
        '@type': 'MenuSection',
        name: category.name,
        hasMenuItem: items,
      });
    }
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'Menu',
    url: `${baseUrl}/`,
    hasMenuSection: sections,
  };
}
