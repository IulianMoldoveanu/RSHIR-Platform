import type { RestaurantTemplate } from '../types';

export const fineDining: RestaurantTemplate = {
  slug: 'fine-dining',
  name: {
    ro: 'Fine Dining',
    en: 'Fine Dining',
  },
  description: {
    ro: 'Bucătărie de autor, ingrediente premium, prezentare la nivel de stea Michelin.',
    en: 'Chef-driven cuisine, premium ingredients, Michelin-level plating.',
  },
  branding: {
    brand_color: '#064e3b',
    accent_color: '#d4af37',
    cover_url: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&q=80',
    logo_letter_bg: '#064e3b',
  },
  typography: {
    heading_font: 'fraunces',
    body_font: 'inter',
  },
  suggested_categories: [
    { name: { ro: 'Amuse-bouche', en: 'Amuse-bouche' }, sort_order: 0 },
    { name: { ro: 'Antreuri', en: 'Starters' }, sort_order: 1 },
    { name: { ro: 'Felul principal', en: 'Mains' }, sort_order: 2 },
    { name: { ro: 'Desert', en: 'Dessert' }, sort_order: 3 },
  ],
  sample_items: [
    {
      category_slug: 'amuse-bouche',
      name: { ro: 'Stridii Fine de Claire', en: 'Fine de Claire Oysters' },
      description: {
        ro: 'Trei stridii proaspete, mignonette de șalotă, lămâie.',
        en: 'Three fresh oysters, shallot mignonette, lemon.',
      },
      price_ron_suggestion: 78,
      image_url: 'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=800&q=80',
    },
    {
      category_slug: 'antreuri',
      name: { ro: 'Tartar de vită Wagyu', en: 'Wagyu Beef Tartare' },
      description: {
        ro: 'Wagyu A5 tăiat la cuțit, gălbenuș fumat, capere, pâine prăjită cu unt brun.',
        en: 'Hand-cut A5 wagyu, smoked yolk, capers, brown butter toast.',
      },
      price_ron_suggestion: 94,
      image_url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&q=80',
    },
    {
      category_slug: 'antreuri',
      name: { ro: 'Foie gras poêlé', en: 'Pan-seared Foie Gras' },
      description: {
        ro: 'Ficat de rață călit, gel de smochine, brioșă tostată, sare Maldon.',
        en: 'Seared duck liver, fig gel, toasted brioche, Maldon salt.',
      },
      price_ron_suggestion: 110,
      image_url: 'https://images.unsplash.com/photo-1547573854-74d2a71d0826?w=800&q=80',
    },
    {
      category_slug: 'felul-principal',
      name: { ro: 'Risotto cu trufe negre', en: 'Black Truffle Risotto' },
      description: {
        ro: 'Orez Carnaroli, parmigiano 24 de luni, trufe negre proaspete, unt nobil.',
        en: 'Carnaroli rice, 24-month parmigiano, fresh black truffles, brown butter.',
      },
      price_ron_suggestion: 145,
      image_url: 'https://images.unsplash.com/photo-1432139509613-5c4255815697?w=800&q=80',
    },
    {
      category_slug: 'felul-principal',
      name: { ro: 'Rack of Lamb', en: 'Rack of Lamb' },
      description: {
        ro: 'Cotlet de miel în crustă de ierburi, piure de țelină, jus de rozmarin.',
        en: 'Herb-crusted lamb rack, celeriac purée, rosemary jus.',
      },
      price_ron_suggestion: 168,
      image_url: 'https://images.unsplash.com/photo-1514516345957-556ca7d90a29?w=800&q=80',
    },
    {
      category_slug: 'felul-principal',
      name: { ro: 'Ton albastru à la plancha', en: 'Bluefin Tuna à la Plancha' },
      description: {
        ro: 'Ton roșu sigilat la grill, ponzu yuzu, daikon murat, susan negru.',
        en: 'Seared bluefin tuna, yuzu ponzu, pickled daikon, black sesame.',
      },
      price_ron_suggestion: 175,
      image_url: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=800&q=80',
    },
    {
      category_slug: 'desert',
      name: { ro: 'Soufflé au Chocolat', en: 'Chocolate Soufflé' },
      description: {
        ro: 'Suflé cald cu ciocolată Valrhona 70%, sorbet de zmeură.',
        en: 'Warm Valrhona 70% chocolate soufflé, raspberry sorbet.',
      },
      price_ron_suggestion: 58,
      image_url: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=800&q=80',
    },
    {
      category_slug: 'desert',
      name: { ro: 'Selecție de brânzeturi maturate', en: 'Aged Cheese Selection' },
      description: {
        ro: 'Cinci brânzeturi europene, miere de trufe, nuci caramelizate, baghetă crocantă.',
        en: 'Five European cheeses, truffle honey, candied walnuts, crisp baguette.',
      },
      price_ron_suggestion: 82,
      image_url: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&q=80',
    },
  ],
  pricing_defaults: {
    min_order_ron: 200,
    free_delivery_threshold_ron: 400,
    delivery_eta_min_minutes: 45,
    delivery_eta_max_minutes: 70,
  },
  settings_defaults: {
    cod_enabled: false,
    pickup_enabled: true,
  },
};
