/**
 * Item slug encoding.
 *
 * The DB has no `slug` column on `restaurant_menu_items`, but the spec requires
 * shareable URLs of the form `/m/[item-slug]`. We synthesize:
 *
 *   <kebab-name>-<8-char-id-prefix>
 *
 * The trailing 8-char hex segment is what we look up in the database. The
 * leading kebab-cased name is purely cosmetic for SEO and link previews.
 */

const SHORT_ID_LEN = 8;

export function kebabize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function buildItemSlug(item: { id: string; name: string }): string {
  const kebab = kebabize(item.name) || 'item';
  return `${kebab}-${item.id.replace(/-/g, '').slice(0, SHORT_ID_LEN)}`;
}

/**
 * Extract the short-id from a slug. Returns null if the slug doesn't end with
 * a plausible 8-char hex segment.
 */
export function shortIdFromSlug(slug: string): string | null {
  const match = slug.match(/-([a-f0-9]{8})$/i);
  return match ? match[1].toLowerCase() : null;
}
