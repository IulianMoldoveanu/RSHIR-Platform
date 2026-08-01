// Real HIR clients with signed contracts, shown on `/clienti` and the
// homepage logo strip. All four are Brașov businesses that signed on before
// their technical onboarding — no tenants row to pull branding from yet, so
// this is a small curated list rather than a DB query (unlike the
// ACTIVE-tenant path used elsewhere). Update this file the day each one gets
// a real storefront; nothing else needs to change to pick it up.
//
// 2026-08-01 — each entry now carries its OWN logo (Iulian: "toate
// restaurantele trebuie sa aiba logo ul lor ... cu numar de locatii"),
// self-hosted under public/clients/ rather than hotlinked, so the page can't
// break when a client redesigns their site. Sources:
//   Delivery House    — our own tenant-branding bucket (they're tenant `deliveryhouse`)
//   Brunch House      — brunchhouse.ro header wordmark
//   Egg & Smash House — eggsmashhouse.ro header wordmark
//   Roata Norocului   — roata-norocului.ro header lockup. Theirs is
//                       white-on-transparent (invisible on a white card), so
//                       it sits on a chip in their own brand burgundy
//
// `locations` + `city` are verified against each client's own website, not
// estimated — this is public copy about someone else's business.

export type MarketingClient = {
  slug: string;
  name: string;
  city: string;
  /** Number of open locations, per the client's own website. */
  locations: number;
  /** Path under public/ — 480×200 transparent WebP, logo contained + centred. */
  logo: string;
};

export const MARKETING_CLIENTS: readonly MarketingClient[] = [
  {
    slug: 'delivery-house',
    name: 'Delivery House',
    city: 'Brașov',
    locations: 1,
    logo: '/clients/delivery-house.webp',
  },
  {
    slug: 'brunch-house',
    name: 'Brunch House',
    city: 'Brașov',
    locations: 1,
    logo: '/clients/brunch-house.webp',
  },
  {
    slug: 'egg-and-smash-house',
    name: 'Egg & Smash House',
    city: 'Brașov',
    locations: 1,
    logo: '/clients/egg-smash-house.webp',
  },
  {
    slug: 'roata-norocului',
    name: 'Roata Norocului',
    city: 'Brașov',
    locations: 1,
    logo: '/clients/roata-norocului.webp',
  },
] as const;
