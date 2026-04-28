import type { RestaurantTemplate } from '../types';

export const italian: RestaurantTemplate = {
  slug: 'italian',
  name: {
    ro: 'Italian',
    en: 'Italian',
  },
  description: {
    ro: 'Trattoria autentică: paste fresh, pizza la cuptor cu lemne, vinuri italiene.',
    en: 'Authentic trattoria: fresh pasta, wood-fired pizza, Italian wines.',
  },
  branding: {
    brand_color: '#b45309',
    accent_color: '#fef3c7',
    cover_url: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=1600&q=80',
    logo_letter_bg: '#b45309',
  },
  typography: {
    heading_font: 'playfair',
    body_font: 'inter',
  },
  suggested_categories: [
    { name: { ro: 'Antipasti', en: 'Antipasti' }, sort_order: 0 },
    { name: { ro: 'Pizza', en: 'Pizza' }, sort_order: 1 },
    { name: { ro: 'Paste', en: 'Pasta' }, sort_order: 2 },
    { name: { ro: 'Desert', en: 'Dessert' }, sort_order: 3 },
  ],
  sample_items: [
    {
      category_slug: 'antipasti',
      name: { ro: 'Bruschetta al Pomodoro', en: 'Bruschetta al Pomodoro' },
      description: {
        ro: 'Pâine prăjită cu roșii, busuioc proaspăt, usturoi și ulei de măsline.',
        en: 'Toasted bread with tomato, fresh basil, garlic, and olive oil.',
      },
      price_ron_suggestion: 24,
      image_url: 'https://images.unsplash.com/photo-1572441713132-c542fc4fe282?w=800&q=80',
    },
    {
      category_slug: 'pizza',
      name: { ro: 'Pizza Margherita', en: 'Pizza Margherita' },
      description: {
        ro: 'Sos de roșii San Marzano, mozzarella fior di latte, busuioc, ulei extravirgin.',
        en: 'San Marzano tomato sauce, fior di latte mozzarella, basil, extra-virgin olive oil.',
      },
      price_ron_suggestion: 38,
      image_url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80',
    },
    {
      category_slug: 'pizza',
      name: { ro: 'Pizza Diavola', en: 'Pizza Diavola' },
      description: {
        ro: 'Mozzarella, salam picant calabrez, ardei iute, sos de roșii.',
        en: 'Mozzarella, spicy Calabrian salami, hot peppers, tomato sauce.',
      },
      price_ron_suggestion: 44,
      image_url: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=800&q=80',
    },
    {
      category_slug: 'paste',
      name: { ro: 'Spaghetti Carbonara', en: 'Spaghetti Carbonara' },
      description: {
        ro: 'Guanciale, ouă, pecorino romano, piper negru. Rețetă romană autentică.',
        en: 'Guanciale, eggs, pecorino romano, black pepper. Authentic Roman recipe.',
      },
      price_ron_suggestion: 42,
      image_url: 'https://images.unsplash.com/photo-1612874742237-6526221588e3?w=800&q=80',
    },
    {
      category_slug: 'paste',
      name: { ro: 'Lasagna alla Bolognese', en: 'Lasagna alla Bolognese' },
      description: {
        ro: 'Foi de paste, ragu de vită, besciamella, parmigiano reggiano.',
        en: 'Pasta sheets, beef ragu, béchamel, parmigiano reggiano.',
      },
      price_ron_suggestion: 46,
      image_url: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=1600&q=80',
    },
    {
      category_slug: 'paste',
      name: { ro: 'Tagliatelle ai Funghi Porcini', en: 'Tagliatelle with Porcini' },
      description: {
        ro: 'Tagliatelle cu hribi, unt, parmigiano, pătrunjel.',
        en: 'Tagliatelle with porcini mushrooms, butter, parmigiano, parsley.',
      },
      price_ron_suggestion: 48,
      image_url: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&q=80',
    },
    {
      category_slug: 'desert',
      name: { ro: 'Tiramisù', en: 'Tiramisù' },
      description: {
        ro: 'Mascarpone, savoiardi în cafea espresso, cacao. Făcut în casă.',
        en: 'Mascarpone, ladyfingers soaked in espresso, cocoa. House-made.',
      },
      price_ron_suggestion: 22,
      image_url: 'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=800&q=80',
    },
    {
      category_slug: 'desert',
      name: { ro: 'Espresso', en: 'Espresso' },
      description: {
        ro: 'Boabe arabica 100%, extracție lentă.',
        en: '100% arabica beans, slow extraction.',
      },
      price_ron_suggestion: 9,
      image_url: 'https://images.unsplash.com/photo-1606787366850-de6330128bfc?w=800&q=80',
    },
  ],
  pricing_defaults: {
    min_order_ron: 50,
    free_delivery_threshold_ron: 120,
    delivery_eta_min_minutes: 30,
    delivery_eta_max_minutes: 50,
  },
  settings_defaults: {
    cod_enabled: true,
    pickup_enabled: true,
  },
};
