// Real HIR clients with signed contracts, shown on `/clienti` and the
// homepage logo strip. All four are Brașov businesses that signed on before
// their technical onboarding — no tenants row, no branding.logo_url to pull
// from yet, so this is a small curated list rather than a DB query (unlike
// the ACTIVE-tenant path used elsewhere). Update this file the day each one
// gets a real storefront; nothing else needs to change to pick it up.
//
// Each client gets its own duotone accent (same gradient-tile treatment as
// the storefront category icons) so the wordmark cards read as designed,
// not as a plain list — consistent visual language across the site.

export type MarketingClient = {
  slug: string;
  name: string;
  city: string;
  type: { ro: string; en: string };
  gradient: readonly [from: string, to: string];
};

export const MARKETING_CLIENTS: readonly MarketingClient[] = [
  {
    slug: 'delivery-house',
    name: 'Delivery House',
    city: 'Brașov',
    type: { ro: 'Bucătărie de livrare, multi-brand', en: 'Multi-brand delivery kitchen' },
    gradient: ['#8B5CF6', '#6D28D9'],
  },
  {
    slug: 'brunch-house',
    name: 'Brunch House',
    city: 'Brașov',
    type: { ro: 'Restaurant — mic dejun & brunch', en: 'Breakfast & brunch restaurant' },
    gradient: ['#F59E0B', '#B45309'],
  },
  {
    slug: 'egg-and-smash-house',
    name: 'Egg & Smash House',
    city: 'Brașov',
    type: { ro: 'Restaurant — breakfast & burgeri', en: 'Breakfast & burger restaurant' },
    gradient: ['#F43F5E', '#BE123C'],
  },
  {
    slug: 'roata-norocului',
    name: 'Roata Norocului',
    city: 'Brașov',
    type: { ro: 'Restaurant tradițional românesc, din 1991', en: 'Traditional Romanian restaurant, since 1991' },
    gradient: ['#10B981', '#047857'],
  },
] as const;
