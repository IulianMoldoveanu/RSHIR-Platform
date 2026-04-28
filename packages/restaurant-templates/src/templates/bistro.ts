import type { RestaurantTemplate } from '../types';

export const bistro: RestaurantTemplate = {
  slug: 'bistro',
  name: {
    ro: 'Bistro Francez',
    en: 'French Bistro',
  },
  description: {
    ro: 'Bucătărie franceză de cartier — clasice atemporale, vinuri la pahar, atmosferă caldă.',
    en: 'Neighbourhood French cooking — timeless classics, wines by the glass, cosy room.',
  },
  branding: {
    brand_color: '#7c2d12',
    accent_color: '#fef3c7',
    cover_url: 'https://images.unsplash.com/photo-1485921325833-c519f76c4927?w=1600&q=80',
    logo_letter_bg: '#7c2d12',
  },
  typography: {
    heading_font: 'fraunces',
    body_font: 'inter',
  },
  suggested_categories: [
    { name: { ro: 'Entrées', en: 'Starters' }, sort_order: 0 },
    { name: { ro: 'Plats', en: 'Mains' }, sort_order: 1 },
    { name: { ro: 'Desserts', en: 'Desserts' }, sort_order: 2 },
    { name: { ro: 'Vin & Băuturi', en: 'Wine & Drinks' }, sort_order: 3 },
  ],
  sample_items: [
    {
      category_slug: 'entrees',
      name: { ro: 'Soupe à l’oignon', en: 'French Onion Soup' },
      description: {
        ro: 'Ceapă caramelizată în vin alb, supă de vită, crouton, gruyère gratinat.',
        en: 'Wine-caramelised onions, beef broth, crouton, gratinéed gruyère.',
      },
      price_ron_suggestion: 32,
      image_url: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=800&q=80',
    },
    {
      category_slug: 'entrees',
      name: { ro: 'Quiche Lorraine', en: 'Quiche Lorraine' },
      description: {
        ro: 'Aluat fragil, smântână, ouă, bacon afumat, gruyère.',
        en: 'Buttery shortcrust, cream, eggs, smoked bacon, gruyère.',
      },
      price_ron_suggestion: 28,
      image_url: 'https://images.unsplash.com/photo-1559054663-e8d23213f55c?w=800&q=80',
    },
    {
      category_slug: 'entrees',
      name: { ro: 'Salade Niçoise', en: 'Niçoise Salad' },
      description: {
        ro: 'Ton, fasole verde, măsline, ou, anșoa, cartofi noi, vinegretă.',
        en: 'Tuna, green beans, olives, egg, anchovy, new potatoes, vinaigrette.',
      },
      price_ron_suggestion: 38,
      image_url: 'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=800&q=80',
    },
    {
      category_slug: 'plats',
      name: { ro: 'Croque-monsieur', en: 'Croque-monsieur' },
      description: {
        ro: 'Pâine pain de mie, șuncă, gruyère, sos béchamel gratinat.',
        en: 'Pain de mie, ham, gruyère, gratinéed béchamel.',
      },
      price_ron_suggestion: 34,
      image_url: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=800&q=80',
    },
    {
      category_slug: 'plats',
      name: { ro: 'Steak frites', en: 'Steak Frites' },
      description: {
        ro: 'Antricot de mânzat, unt cu ierburi, cartofi pai, salată verde.',
        en: 'Aged ribeye, herb butter, golden frites, green salad.',
      },
      price_ron_suggestion: 78,
      image_url: 'https://images.unsplash.com/photo-1600891964092-4316c288032e?w=800&q=80',
    },
    {
      category_slug: 'plats',
      name: { ro: 'Coq au Vin', en: 'Coq au Vin' },
      description: {
        ro: 'Pui fiert lent în vin roșu, ciuperci, ceapă perlată, bacon, ierburi.',
        en: 'Chicken slow-braised in red wine, mushrooms, pearl onions, bacon, herbs.',
      },
      price_ron_suggestion: 64,
      image_url: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=800&q=80',
    },
    {
      category_slug: 'desserts',
      name: { ro: 'Crème Brûlée', en: 'Crème Brûlée' },
      description: {
        ro: 'Cremă de vanilie de Bourbon, crustă de zahăr caramelizat la flacără.',
        en: 'Bourbon vanilla custard, torched caramel sugar crust.',
      },
      price_ron_suggestion: 26,
      image_url: 'https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?w=800&q=80',
    },
    {
      category_slug: 'desserts',
      name: { ro: 'Tarte Tatin', en: 'Tarte Tatin' },
      description: {
        ro: 'Tartă răsturnată cu mere caramelizate, frișcă proaspătă.',
        en: 'Caramelised upside-down apple tart, fresh whipped cream.',
      },
      price_ron_suggestion: 28,
      image_url: 'https://images.unsplash.com/photo-1559847844-5315695dadae?w=800&q=80',
    },
  ],
  pricing_defaults: {
    min_order_ron: 70,
    free_delivery_threshold_ron: 160,
    delivery_eta_min_minutes: 35,
    delivery_eta_max_minutes: 55,
  },
  settings_defaults: {
    cod_enabled: true,
    pickup_enabled: true,
  },
};
