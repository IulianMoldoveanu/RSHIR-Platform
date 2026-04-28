import type { RestaurantTemplate } from '../types';

export const asian: RestaurantTemplate = {
  slug: 'asian',
  name: {
    ro: 'Asian Fusion',
    en: 'Asian Fusion',
  },
  description: {
    ro: 'Sushi, ramen și street food asiatic — arome curate, ingrediente proaspete.',
    en: 'Sushi, ramen and Asian street food — clean flavours, fresh ingredients.',
  },
  branding: {
    brand_color: '#dc2626',
    accent_color: '#0a0a0a',
    cover_url: 'https://images.unsplash.com/photo-1526318896980-cf78c088247c?w=1600&q=80',
    logo_letter_bg: '#dc2626',
  },
  typography: {
    heading_font: 'space-grotesk',
    body_font: 'inter',
  },
  suggested_categories: [
    { name: { ro: 'Aperitive', en: 'Starters' }, sort_order: 0 },
    { name: { ro: 'Sushi', en: 'Sushi' }, sort_order: 1 },
    { name: { ro: 'Wok & Noodles', en: 'Wok & Noodles' }, sort_order: 2 },
    { name: { ro: 'Băuturi', en: 'Drinks' }, sort_order: 3 },
  ],
  sample_items: [
    {
      category_slug: 'aperitive',
      name: { ro: 'Edamame cu sare de mare', en: 'Sea-salt Edamame' },
      description: {
        ro: 'Păstăi de soia tinere, fierte și asezonate cu sare de mare.',
        en: 'Young soybean pods, steamed and tossed in sea salt.',
      },
      price_ron_suggestion: 18,
      image_url: 'https://images.unsplash.com/photo-1583224944844-5b268c057b72?w=800&q=80',
    },
    {
      category_slug: 'aperitive',
      name: { ro: 'Bao Bun cu pui crocant', en: 'Crispy Chicken Bao Bun' },
      description: {
        ro: 'Chiflă bao aburită, pui crocant, maioneză sriracha, castravete murat.',
        en: 'Steamed bao bun, crispy chicken, sriracha mayo, pickled cucumber.',
      },
      price_ron_suggestion: 24,
      image_url: 'https://images.unsplash.com/photo-1626804475297-41608ea09aeb?w=800&q=80',
    },
    {
      category_slug: 'sushi',
      name: { ro: 'California Roll (8 buc)', en: 'California Roll (8 pcs)' },
      description: {
        ro: 'Crab, avocado, castravete, sesam — clasicul de start.',
        en: 'Crab, avocado, cucumber, sesame — the classic starter.',
      },
      price_ron_suggestion: 32,
      image_url: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=800&q=80',
    },
    {
      category_slug: 'sushi',
      name: { ro: 'Salmon Nigiri (4 buc)', en: 'Salmon Nigiri (4 pcs)' },
      description: {
        ro: 'Somon norvegian, orez sushi, wasabi proaspăt.',
        en: 'Norwegian salmon, sushi rice, fresh wasabi.',
      },
      price_ron_suggestion: 28,
      image_url: 'https://images.unsplash.com/photo-1617421753170-46511a8d73fc?w=800&q=80',
    },
    {
      category_slug: 'sushi',
      name: { ro: 'Spicy Tuna Roll (8 buc)', en: 'Spicy Tuna Roll (8 pcs)' },
      description: {
        ro: 'Ton tartar, sriracha, ceapă verde, sesam.',
        en: 'Tuna tartare, sriracha, green onion, sesame.',
      },
      price_ron_suggestion: 38,
      image_url: 'https://images.unsplash.com/photo-1623341214825-9f4f963727da?w=800&q=80',
    },
    {
      category_slug: 'wok-noodles',
      name: { ro: 'Pad Thai cu creveți', en: 'Shrimp Pad Thai' },
      description: {
        ro: 'Tăiței de orez, creveți, ou, alune, lime, sos tamarind.',
        en: 'Rice noodles, shrimp, egg, peanuts, lime, tamarind sauce.',
      },
      price_ron_suggestion: 42,
      image_url: 'https://images.unsplash.com/photo-1559314809-0d155014e29e?w=800&q=80',
    },
    {
      category_slug: 'wok-noodles',
      name: { ro: 'Tonkotsu Ramen', en: 'Tonkotsu Ramen' },
      description: {
        ro: 'Supă de oase de porc fiartă 12 ore, chashu, ou ajitsuke, alge nori.',
        en: '12-hour pork bone broth, chashu, ajitsuke egg, nori.',
      },
      price_ron_suggestion: 46,
      image_url: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800&q=80',
    },
    {
      category_slug: 'wok-noodles',
      name: { ro: 'Pho Bo', en: 'Pho Bo' },
      description: {
        ro: 'Supă vietnameză de vită, tăiței de orez, ierburi proaspete, lime.',
        en: 'Vietnamese beef soup, rice noodles, fresh herbs, lime.',
      },
      price_ron_suggestion: 38,
      image_url: 'https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=800&q=80',
    },
    {
      category_slug: 'bauturi',
      name: { ro: 'Ceai matcha rece', en: 'Iced Matcha' },
      description: {
        ro: 'Matcha ceremonial, lapte, gheață.',
        en: 'Ceremonial matcha, milk, ice.',
      },
      price_ron_suggestion: 16,
      image_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80',
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
