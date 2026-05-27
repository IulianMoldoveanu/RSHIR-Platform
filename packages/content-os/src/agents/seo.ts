// SeoAgent — generates SEO/social metadata for a content draft.
//
// Output: meta_title, meta_description, hashtag pack, schema.org snippet
// (when format is a landing page, not a social post).
//
// Pure logic: this agent is mostly deterministic — it composes from
// BrandContext, brief inputs, and optionally CopyDraft hook/body. We use
// Haiku 4.5 only when a free-form keyword cluster is requested (rare).

import type { BrandContext, Format, PublishChannel } from '../types';

export interface SeoInput {
  brand: BrandContext;
  copyHook: string;
  copyBody?: string;
  format: Format;
  channel?: PublishChannel;
  /** Optional caller hint: ['pizza', 'brasov', 'delivery'] etc. */
  keywordSeeds?: string[];
}

export interface SeoOutput {
  metaTitle: string;       // ≤ 60 chars (Google snippet)
  metaDescription: string; // ≤ 155 chars
  hashtags: string[];      // 3-10, channel-aware
  altText: string;         // for images — derived from visual brief or hook
  schemaOrg?: Record<string, unknown>; // populated for landing-page formats only
}

const CHANNEL_HASHTAG_MAX: Record<PublishChannel | 'default', number> = {
  tiktok: 5,
  instagram: 10,
  facebook: 5,
  linkedin: 3,
  x: 3,
  default: 5,
};

export class SeoAgent {
  build(input: SeoInput): SeoOutput {
    const { brand, copyHook, copyBody, format, channel, keywordSeeds = [] } = input;

    // Meta title: hook truncated to 60 chars, with brand suffix if room.
    const baseTitle = this.truncate(copyHook, 60);
    const withBrand =
      baseTitle.length + brand.displayName.length + 3 <= 60
        ? `${baseTitle} · ${brand.displayName}`
        : baseTitle;
    const metaTitle = this.truncate(withBrand, 60);

    // Meta description: body truncated, or hook+body if body too short.
    const descSource = (copyBody && copyBody.length > 60 ? copyBody : `${copyHook} ${copyBody ?? ''}`).trim();
    const metaDescription = this.truncate(descSource, 155);

    // Hashtags: seeds + brand-derived + city-derived + competitor-anti (for HIR_INTERNAL).
    const tags = new Set<string>();
    for (const seed of keywordSeeds) tags.add(this.slugify(seed));
    tags.add(this.slugify(brand.displayName));
    if (brand.businessType && brand.businessType !== 'other' && brand.businessType !== 'general') {
      tags.add(brand.businessType);
    }
    const cap = CHANNEL_HASHTAG_MAX[channel ?? 'default'];
    const hashtags = Array.from(tags)
      .filter(Boolean)
      .slice(0, cap)
      .map((t) => `#${t}`);

    // Alt text: shortest meaningful description for accessibility / OG image.
    const altText = this.truncate(copyHook, 100);

    // Schema.org: populated only for landing-page formats. Social posts
    // don't carry schema.org meaning — return undefined.
    let schemaOrg: Record<string, unknown> | undefined;
    if (format === 'meta_title') {
      schemaOrg = {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: brand.displayName,
        description: metaDescription,
      };
    }

    return {
      metaTitle,
      metaDescription,
      hashtags,
      altText,
      schemaOrg,
    };
  }

  /**
   * Slugify a string into a lowercase ASCII-only hashtag-safe form.
   * Strips diacritics, removes non-alphanumerics, collapses runs.
   */
  slugify(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')      // strip combining marks (ă→a, ș→s)
      .replace(/[^a-z0-9]+/g, '')           // remove non-alphanumeric
      .slice(0, 30);
  }

  /**
   * Truncate a string to a max length INCLUSIVE of the ellipsis suffix,
   * preserving word boundaries when reasonable. Always returns ≤ max chars.
   */
  truncate(s: string, max: number): string {
    if (!s) return '';
    if (s.length <= max) return s;
    // Reserve 1 character for the ellipsis when we know we'll add one.
    const budget = max - 1;
    if (budget <= 0) return s.slice(0, max);
    const cut = s.slice(0, budget);
    const lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > budget * 0.6) {
      return cut.slice(0, lastSpace).trimEnd() + '…';
    }
    return cut.trimEnd() + '…';
  }
}
