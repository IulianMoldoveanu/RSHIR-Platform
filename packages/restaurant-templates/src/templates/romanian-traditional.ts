import type { RestaurantTemplate } from '../types';

export const romanianTraditional: RestaurantTemplate = {
  slug: 'romanian-traditional',
  name: {
    ro: 'Tradițional Românesc',
    en: 'Traditional Romanian',
  },
  description: {
    ro: 'Bucate ca la mama acasă: sarmale, mămăligă, mici la grătar și țuică de prună.',
    en: 'Home-style Romanian cooking: cabbage rolls, polenta, grilled mici, plum brandy.',
  },
  branding: {
    brand_color: '#0f4c5c',
    accent_color: '#c08552',
    cover_url: 'https://images.unsplash.com/photo-1533777324565-a040eb52facd?w=1600&q=80',
    logo_letter_bg: '#0f4c5c',
  },
  typography: {
    heading_font: 'playfair',
    body_font: 'inter',
  },
  suggested_categories: [
    { name: { ro: 'Aperitive', en: 'Starters' }, sort_order: 0 },
    { name: { ro: 'Ciorbe', en: 'Soups' }, sort_order: 1 },
    { name: { ro: 'Feluri principale', en: 'Mains' }, sort_order: 2 },
    { name: { ro: 'Desert & Băuturi', en: 'Dessert & Drinks' }, sort_order: 3 },
  ],
  sample_items: [
    {
      category_slug: 'aperitive',
      name: { ro: 'Platou cu brânzeturi și mezeluri', en: 'Cheese & Charcuterie Platter' },
      description: {
        ro: 'Telemea, cașcaval afumat, slănină, șuncă de Sibiu, ardei copt, măsline.',
        en: 'Sheep cheese, smoked cheese, lard, Sibiu salami, roasted pepper, olives.',
      },
      price_ron_suggestion: 48,
      image_url: 'https://images.unsplash.com/photo-1543353071-873f17a7a088?w=800&q=80',
    },
    {
      category_slug: 'aperitive',
      name: { ro: 'Salată de vinete', en: 'Eggplant Salad' },
      description: {
        ro: 'Vinete coapte pe lemne, ceapă, ulei, servită cu pâine de casă.',
        en: 'Wood-fire-roasted eggplant, onion, oil, served with country bread.',
      },
      price_ron_suggestion: 24,
      image_url: 'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800&q=80',
    },
    {
      category_slug: 'ciorbe',
      name: { ro: 'Ciorbă rădăuțeană', en: 'Rădăuți-style Chicken Soup' },
      description: {
        ro: 'Ciorbă de pui, smântână, usturoi, oțet — specialitate bucovineană.',
        en: 'Chicken soup with sour cream, garlic, vinegar — Bukovina specialty.',
      },
      price_ron_suggestion: 26,
      image_url: 'https://images.unsplash.com/photo-1604152135912-04a022e23696?w=800&q=80',
    },
    {
      category_slug: 'ciorbe',
      name: { ro: 'Ciorbă de burtă', en: 'Tripe Soup' },
      description: {
        ro: 'Burtă de vită, smântână, usturoi, ardei iute, oțet.',
        en: 'Beef tripe, sour cream, garlic, hot pepper, vinegar.',
      },
      price_ron_suggestion: 28,
      image_url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&q=80',
    },
    {
      category_slug: 'feluri-principale',
      name: { ro: 'Sarmale cu mămăligă', en: 'Sarmale with Polenta' },
      description: {
        ro: 'Sarmale în foi de varză murată, carne de porc, mămăligă, smântână, ardei iute.',
        en: 'Pickled-cabbage rolls with pork, polenta, sour cream, hot pepper.',
      },
      price_ron_suggestion: 42,
      image_url: 'https://images.unsplash.com/photo-1574484284002-952d92456975?w=800&q=80',
    },
    {
      category_slug: 'feluri-principale',
      name: { ro: 'Mici cu muștar (5 buc)', en: 'Mici with Mustard (5 pcs)' },
      description: {
        ro: 'Cinci mici la grătar pe cărbuni, muștar Tecuci, pâine, murături.',
        en: 'Five charcoal-grilled mici, Tecuci mustard, bread, pickles.',
      },
      price_ron_suggestion: 36,
      image_url: 'https://images.unsplash.com/photo-1593504049359-74330189a345?w=800&q=80',
    },
    {
      category_slug: 'feluri-principale',
      name: { ro: 'Mămăligă cu brânză și ou', en: 'Polenta with Cheese and Egg' },
      description: {
        ro: 'Mămăligă caldă, telemea de oaie, ou ochi, smântână grasă.',
        en: 'Warm polenta, sheep cheese, fried egg, thick sour cream.',
      },
      price_ron_suggestion: 32,
      image_url: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=800&q=80',
    },
    {
      category_slug: 'desert-bauturi',
      name: { ro: 'Papanași cu dulceață', en: 'Papanași with Jam' },
      description: {
        ro: 'Papanași prăjiți, smântână, dulceață de afine de pădure.',
        en: 'Fried cheese doughnuts, sour cream, wild blueberry jam.',
      },
      price_ron_suggestion: 28,
      image_url: 'https://images.unsplash.com/photo-1606756790138-261d2b21cd75?w=800&q=80',
    },
    {
      category_slug: 'desert-bauturi',
      name: { ro: 'Țuică de prune (50ml)', en: 'Plum Brandy (50ml)' },
      description: {
        ro: 'Țuică artizanală din prune, învechită, 52% vol.',
        en: 'Artisan-distilled plum brandy, aged, 52% ABV.',
      },
      price_ron_suggestion: 14,
      image_url: 'https://images.unsplash.com/photo-1591299177061-2151e53fcaea?w=800&q=80',
    },
  ],
  pricing_defaults: {
    min_order_ron: 50,
    free_delivery_threshold_ron: 130,
    delivery_eta_min_minutes: 30,
    delivery_eta_max_minutes: 50,
  },
  settings_defaults: {
    cod_enabled: true,
    pickup_enabled: true,
  },
};
