import type { RestaurantTemplate } from '../types';

// Bold Urban: high-contrast, Oswald condensed for headings, vivid red.
// Targets urban fast-casual / street food / burgers / kebab.
// Oswald must be loaded in apps/restaurant-web/src/app/layout.tsx
// (see variable --font-oswald, added alongside this template).
export const boldUrban: RestaurantTemplate = {
  slug: 'bold-urban',
  name: {
    ro: 'Urban Bold',
    en: 'Bold Urban',
  },
  description: {
    ro: 'Contrast puternic, roșu aprins, Oswald condensed — identitate de street food urban.',
    en: 'High contrast, vivid red, Oswald condensed type — urban street food identity.',
  },
  branding: {
    brand_color: '#dc2626',
    accent_color: '#1c1917',
    cover_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=1600&q=80',
    logo_letter_bg: '#dc2626',
  },
  typography: {
    heading_font: 'oswald',
    body_font: 'inter',
  },
  suggested_categories: [
    { name: { ro: 'Burgeri', en: 'Burgers' }, sort_order: 0 },
    { name: { ro: 'Wraps & Kebab', en: 'Wraps & Kebab' }, sort_order: 1 },
    { name: { ro: 'Cartofi & Sides', en: 'Fries & Sides' }, sort_order: 2 },
    { name: { ro: 'Sosuri', en: 'Sauces' }, sort_order: 3 },
    { name: { ro: 'Băuturi', en: 'Drinks' }, sort_order: 4 },
  ],
  sample_items: [
    {
      category_slug: 'burgeri',
      name: { ro: 'The OG Smash', en: 'The OG Smash' },
      description: {
        ro: 'Double smash patty, cheddar topit, sos secret, roșii, ceapă caramelizată, brioche.',
        en: 'Double smash patty, melted cheddar, secret sauce, tomatoes, caramelised onion, brioche.',
      },
      price_ron_suggestion: 48,
      image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80',
    },
    {
      category_slug: 'burgeri',
      name: { ro: 'Crispy Chicken', en: 'Crispy Chicken' },
      description: {
        ro: 'Pui crispy în buttermilk, coleslaw, pickles, sos chipotle-mayo, brioche.',
        en: 'Buttermilk crispy chicken, coleslaw, pickles, chipotle-mayo sauce, brioche.',
      },
      price_ron_suggestion: 44,
      image_url: 'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=800&q=80',
    },
    {
      category_slug: 'wraps-kebab',
      name: { ro: 'Döner cu pui', en: 'Chicken Döner' },
      description: {
        ro: 'Pui la rotiserie, salată, roșii, ceapă, sos alb, lavash.',
        en: 'Rotisserie chicken, lettuce, tomatoes, onion, white sauce, lavash.',
      },
      price_ron_suggestion: 36,
      image_url: 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=800&q=80',
    },
    {
      category_slug: 'cartofi-sides',
      name: { ro: 'Loaded Fries', en: 'Loaded Fries' },
      description: {
        ro: 'Cartofi proaspeți, cheddar topit, bacon crispy, jalapeños, smântână.',
        en: 'Fresh-cut fries, melted cheddar, crispy bacon, jalapeños, sour cream.',
      },
      price_ron_suggestion: 28,
      image_url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=800&q=80',
    },
  ],
  pricing_defaults: {
    min_order_ron: 40,
    free_delivery_threshold_ron: 100,
    delivery_eta_min_minutes: 20,
    delivery_eta_max_minutes: 40,
  },
  settings_defaults: {
    cod_enabled: true,
    pickup_enabled: true,
  },
};
