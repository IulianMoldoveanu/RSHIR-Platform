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

// Lane MARKETING-POLISH-V4B (2026-05-16) — pricing-page specific JSON-LD.
// The /pricing route already renders the same FAQ copy in <details> HTML;
// this helper mirrors that content so Google can show the FAQ rich result
// in the SERP. Keep the Q/A pairs in sync manually when copy changes
// (1-2 reviews per quarter — small enough not to warrant a derive).
const PRICING_FAQ_ITEMS: FaqJsonLdInput = [
  {
    question: 'Cât plătesc pentru HIR?',
    answer:
      '2 lei pe comandă livrată. Nu există abonament, nu există procent din valoare, nu există taxă de setup. Plătești doar pentru comenzile care ajung efectiv la client.',
  },
  {
    question: 'Există o perioadă de probă?',
    answer:
      '30 de zile gratuite, fără card bancar. Primele 50 de restaurante înscrise primesc instalarea și migrarea din GloriaFood incluse, fără cost.',
  },
  {
    question: 'Există comision din valoarea comenzii?',
    answer:
      'Nu. HIR percepe 2 lei fix pe comandă livrată, indiferent dacă comanda este de 30 lei sau de 300 lei. Restul rămâne integral la restaurant.',
  },
  {
    question: 'Ce se întâmplă cu comenzile anulate?',
    answer:
      'Nu plătești pentru comenzile anulate înainte de livrare. Tariful de 2 lei se aplică doar comenzilor finalizate cu succes.',
  },
  {
    question: 'Pot folosi propriul curier?',
    answer:
      'Da. Poți folosi flota proprie, flotă parteneră sau pickup. HIR nu te obligă să folosești un curier extern și nu adaugă comision suplimentar pentru livrare proprie.',
  },
  {
    question: 'Cum se face plata către HIR?',
    answer:
      'Factură lunară emisă automat pentru totalul comenzilor livrate în luna precedentă. Plată prin transfer bancar sau card.',
  },
];

/**
 * FAQPage JSON-LD for `/pricing`. Mirrors the 6 questions rendered in the
 * page's `<details>` FAQ block. Surfaces as expandable rich results in SERP.
 */
export function pricingFaqJsonLd() {
  return buildFaqJsonLd(PRICING_FAQ_ITEMS);
}

/**
 * Product JSON-LD for the 2-RON-per-order SKU on `/pricing`. Google can
 * surface price + availability directly in shopping/SERP panels.
 *
 * `priceValidUntil` is left as a far-future placeholder since this is a
 * recurring per-order fee, not a time-limited promo. Adjust if Iulian
 * locks a fixed pricing window.
 */
export function pricingProductJsonLd(input: { url: string; imageUrl?: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'HIRforYOU — comandă online pentru restaurante',
    description:
      'Tarif unic 2 lei per comandă livrată. Fără abonament, fără procent, fără taxă de setup. Instalare gratuită pentru primele 50 de restaurante.',
    brand: { '@type': 'Brand', name: 'HIRforYOU' },
    image: input.imageUrl ? [input.imageUrl] : undefined,
    offers: {
      '@type': 'Offer',
      url: input.url,
      priceCurrency: 'RON',
      price: '2.00',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: '2.00',
        priceCurrency: 'RON',
        unitText: 'per comandă livrată',
      },
      availability: 'https://schema.org/InStock',
      seller: { '@type': 'Organization', name: 'HIRforYOU' },
    },
  };
}
