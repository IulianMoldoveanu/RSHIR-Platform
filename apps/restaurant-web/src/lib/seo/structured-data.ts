// Lane SEO+ (2026-05-05) — schema.org builders for marketing routes.
//
// Lane I (jsonld-helpers.ts) covers tenant storefront: Restaurant + Menu.
// Lane Q (seo-marketing.ts) covers Organization + WebSite + BreadcrumbList.
// This module adds Article (case studies) + FAQPage (migrate landing) and
// re-exports the existing builders so future pages can `import from
// '@/lib/seo/structured-data'` and get one canonical surface.
//
// All output is consumed by `safeJsonLd` (escapes `<`/`>`/`&` so a string
// can't break out of the script tag).

export {
  buildRestaurantJsonLd,
  buildMenuJsonLd,
  type RestaurantJsonLdInput,
} from './jsonld-helpers';

export {
  organizationJsonLd,
  websiteJsonLd,
  breadcrumbJsonLd,
} from '../seo-marketing';

export type ArticleJsonLdInput = {
  headline: string;
  description: string;
  url: string;
  imageUrl: string;
  datePublished: string; // ISO-8601
  dateModified?: string;
  authorName?: string;
  publisherName?: string;
  publisherLogoUrl?: string;
};

/**
 * Article schema for case-study pages. Google uses this to render
 * date / publisher / image in news + discover surfaces. `mainEntityOfPage`
 * tells crawlers the URL is the canonical home for the article.
 */
export function buildArticleJsonLd(input: ArticleJsonLdInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.headline,
    description: input.description,
    image: [input.imageUrl],
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    author: {
      '@type': 'Organization',
      name: input.authorName ?? 'HIRforYOU',
    },
    publisher: {
      '@type': 'Organization',
      name: input.publisherName ?? 'HIRforYOU',
      logo: input.publisherLogoUrl
        ? { '@type': 'ImageObject', url: input.publisherLogoUrl }
        : undefined,
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': input.url },
    url: input.url,
  };
}

export type FaqJsonLdInput = ReadonlyArray<{ question: string; answer: string }>;

/**
 * FAQPage schema — Google can pull these into the SERP as expandable
 * accordions on long-tail queries. Best-fit for `/migrate-from-gloriafood`
 * (every restaurant owner has the same 5-6 doubts about migration).
 */
export function buildFaqJsonLd(items: FaqJsonLdInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}
