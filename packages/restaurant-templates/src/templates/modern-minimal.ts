import type { RestaurantTemplate } from '../types';

export const modernMinimal: RestaurantTemplate = {
  slug: 'modern-minimal',
  name: {
    ro: 'Modern Minimal',
    en: 'Modern Minimal',
  },
  description: {
    ro: 'Design curat, alb și albastru — lasă mâncarea să vorbească. Inter, spații aeriene, umbre discrete.',
    en: 'Clean white and blue design — food does the talking. Inter, airy spacing, subtle shadows.',
  },
  branding: {
    brand_color: '#2563eb',
    accent_color: '#eff6ff',
    cover_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1600&q=80',
    logo_letter_bg: '#2563eb',
  },
  typography: {
    heading_font: 'inter',
    body_font: 'inter',
  },
  suggested_categories: [
    { name: { ro: 'Aperitive', en: 'Starters' }, sort_order: 0 },
    { name: { ro: 'Feluri principale', en: 'Mains' }, sort_order: 1 },
    { name: { ro: 'Salate', en: 'Salads' }, sort_order: 2 },
    { name: { ro: 'Deserturi', en: 'Desserts' }, sort_order: 3 },
    { name: { ro: 'Băuturi', en: 'Drinks' }, sort_order: 4 },
  ],
  sample_items: [
    {
      category_slug: 'aperitive',
      name: { ro: 'Hummus cu pită', en: 'Hummus with Pita' },
      description: {
        ro: 'Cremă de naut cu tahini, lămâie și ulei de măsline, pită proaspătă.',
        en: 'Smooth chickpea cream with tahini, lemon, and olive oil, fresh pita.',
      },
      price_ron_suggestion: 22,
      image_url: 'https://images.unsplash.com/photo-1576158113928-4c240eaaf360?w=800&q=80',
    },
    {
      category_slug: 'feluri-principale',
      name: { ro: 'Piept de pui grătar', en: 'Grilled Chicken Breast' },
      description: {
        ro: 'Pui marinat cu ierburi, legume la grătar, sos de lămâie.',
        en: 'Herb-marinated chicken, grilled vegetables, lemon sauce.',
      },
      price_ron_suggestion: 48,
      image_url: 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=800&q=80',
    },
    {
      category_slug: 'salate',
      name: { ro: 'Salată Caesar', en: 'Caesar Salad' },
      description: {
        ro: 'Salată romaine, dressing Caesar, crutoane artizanale, parmigiano.',
        en: 'Romaine lettuce, Caesar dressing, artisan croutons, parmigiano.',
      },
      price_ron_suggestion: 34,
      image_url: 'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=800&q=80',
    },
    {
      category_slug: 'deserturi',
      name: { ro: 'Panna cotta cu fructe de pădure', en: 'Panna Cotta with Berries' },
      description: {
        ro: 'Panna cotta clasică cu coulis de fructe de pădure proaspete.',
        en: 'Classic panna cotta with fresh berry coulis.',
      },
      price_ron_suggestion: 24,
      image_url: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=800&q=80',
    },
  ],
  pricing_defaults: {
    min_order_ron: 50,
    free_delivery_threshold_ron: 130,
    delivery_eta_min_minutes: 25,
    delivery_eta_max_minutes: 45,
  },
  settings_defaults: {
    cod_enabled: false,
    pickup_enabled: true,
  },
};
