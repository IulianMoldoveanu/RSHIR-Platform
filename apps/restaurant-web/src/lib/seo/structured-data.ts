// Lane SEO+ (2026-05-05) — schema.org builders for marketing routes.
//
// Lane I (jsonld-helpers.ts) covers tenant storefront: Restaurant + Menu.
// Lane Q (seo-marketing.ts) covers Organization + WebSite + BreadcrumbList.
// This module adds FAQPage (migrate landing) and re-exports the existing
// builders so future pages can `import from '@/lib/seo/structured-data'`
// and get one canonical surface.
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
      'Abonament lunar simplu, fără comision procentual din valoarea comenzii, fără taxă de setup. Livrarea este separată — se contractează printr-o ofertă personalizată sau o faci cu echipa ta proprie.',
  },
  {
    question: 'Există o perioadă de probă?',
    answer:
      '30 de zile gratuite, fără card bancar. Primii 50 de vendori înscriși (restaurante, florării, magazine de cadouri) primesc instalarea inclusă, fără cost. Import gratuit din GloriaFood / WooCommerce / CSV.',
  },
  {
    question: 'Există comision din valoarea comenzii?',
    answer:
      'Nu. HIR percepe un abonament lunar fix, indiferent de câte comenzi procesezi sau ce valoare au. Restul rămâne integral la restaurant.',
  },
  {
    question: 'Ce se întâmplă cu comenzile anulate?',
    answer:
      'Comenzile anulate nu sunt taxate separat — abonamentul HIR este fix, indiferent de câte comenzi sunt anulate sau finalizate.',
  },
  {
    question: 'Pot folosi propriul curier?',
    answer:
      'Da. Poți folosi flota proprie, flotă parteneră sau pickup — abonamentul HIR acoperă doar platforma de comenzi, costul curierului tău rămâne al tău. Dacă nu ai curieri, îți construim o ofertă personalizată de livrare prin rețeaua HIR, potrivită zonei și volumului tău.',
  },
  {
    question: 'Cum se face plata către HIR?',
    answer:
      'Abonamentul se facturează lunar. Costul de livrare (dacă folosești oferta personalizată HIR) apare facturat separat. Plată prin transfer bancar sau card.',
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
 * Product JSON-LD for the HIRforYOU subscription SKU on `/pricing`. No
 * `offers`/price block: the subscription figure has not been published yet
 * (owner has not locked the number), so we omit `Offer.price` rather than
 * publish a stale or invented figure in Google rich results.
 */
export function pricingProductJsonLd(input: { url: string; imageUrl?: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'HIRforYOU — comandă online pentru orice tip de business',
    description:
      'Abonament lunar simplu pentru orice tip de business. Fără comision procentual, fără taxă de setup. Livrarea este separată și se contractează printr-o ofertă personalizată. Instalare gratuită pentru primele 50 de vendori (restaurante, florării, magazine de cadouri).',
    brand: { '@type': 'Brand', name: 'HIRforYOU' },
    image: input.imageUrl ? [input.imageUrl] : undefined,
    url: input.url,
  };
}
