import type { RestaurantTemplate } from '../types';

// Distinct from the `bistro` (French bistro, fraunces, dark brown #7c2d12):
// Warm Bistro targets casual Mediterranean/Romanian dining — cream palette,
// Playfair Display serif, amber-gold accent. Different slug, distinct covers.
export const warmBistro: RestaurantTemplate = {
  slug: 'warm-bistro',
  name: {
    ro: 'Bistro Cald',
    en: 'Warm Bistro',
  },
  description: {
    ro: 'Tonuri creme și aurii, Playfair Display, spații generoase — atmosfera unui bistro de cartier.',
    en: 'Cream and gold tones, Playfair Display, generous spacing — neighbourhood bistro feel.',
  },
  branding: {
    brand_color: '#92400e',
    accent_color: '#fdf8f0',
    cover_url: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&q=80',
    logo_letter_bg: '#92400e',
  },
  typography: {
    heading_font: 'playfair',
    body_font: 'inter',
  },
  suggested_categories: [
    { name: { ro: 'Aperitive', en: 'Starters' }, sort_order: 0 },
    { name: { ro: 'Supe & Ciorbe', en: 'Soups & Broths' }, sort_order: 1 },
    { name: { ro: 'Feluri principale', en: 'Mains' }, sort_order: 2 },
    { name: { ro: 'Deserturi', en: 'Desserts' }, sort_order: 3 },
    { name: { ro: 'Vin & Băuturi', en: 'Wine & Drinks' }, sort_order: 4 },
  ],
  sample_items: [
    {
      category_slug: 'aperitive',
      name: { ro: 'Taboulé cu mentă', en: 'Mint Tabbouleh' },
      description: {
        ro: 'Grâu bulgur, roșii cherry, mentă proaspătă, lămâie, ulei de măsline.',
        en: 'Bulgur wheat, cherry tomatoes, fresh mint, lemon, olive oil.',
      },
      price_ron_suggestion: 26,
      image_url: 'https://images.unsplash.com/photo-1515516969-d4008cc6241a?w=800&q=80',
    },
    {
      category_slug: 'supe-ciorbe',
      name: { ro: 'Supă cremă de dovleac', en: 'Cream of Pumpkin Soup' },
      description: {
        ro: 'Dovleac copt, smântână, nucșoară, semințe de dovleac prăjite.',
        en: 'Roasted pumpkin, cream, nutmeg, toasted pumpkin seeds.',
      },
      price_ron_suggestion: 28,
      image_url: 'https://images.unsplash.com/photo-1476718406336-bb5a9690ee2a?w=800&q=80',
    },
    {
      category_slug: 'feluri-principale',
      name: { ro: 'Cotlet de miel cu rozmariu', en: 'Rosemary Lamb Chops' },
      description: {
        ro: 'Cotlete de miel cu rozmariu și usturoi, piure de cartofi cu trufe, jus.',
        en: 'Rosemary and garlic lamb chops, truffle mash, jus.',
      },
      price_ron_suggestion: 72,
      image_url: 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=800&q=80',
    },
    {
      category_slug: 'deserturi',
      name: { ro: 'Fondant de ciocolată', en: 'Chocolate Fondant' },
      description: {
        ro: 'Fondant cald cu inimă lichidă, înghețată de vanilie, fructe de pădure.',
        en: 'Warm chocolate fondant with liquid centre, vanilla ice cream, berries.',
      },
      price_ron_suggestion: 32,
      image_url: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800&q=80',
    },
  ],
  pricing_defaults: {
    min_order_ron: 60,
    free_delivery_threshold_ron: 150,
    delivery_eta_min_minutes: 35,
    delivery_eta_max_minutes: 55,
  },
  settings_defaults: {
    cod_enabled: true,
    pickup_enabled: true,
  },
};
