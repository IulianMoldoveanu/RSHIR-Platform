// Restaurant vertical templates — typed data primitives.
// Consumed by the onboarding flow to seed a new tenant's storefront.

export type RestaurantTemplateSlug =
  | 'italian'
  | 'asian'
  | 'fine-dining'
  | 'bistro'
  | 'romanian-traditional';

export type LocalizedString = {
  ro: string;
  en: string;
};

export type RestaurantTemplate = {
  slug: RestaurantTemplateSlug;
  name: LocalizedString;
  description: LocalizedString;
  branding: {
    brand_color: string; // hex
    accent_color: string; // hex
    cover_url: string; // Unsplash photo, verified-good
    logo_letter_bg: string; // hex for the "letter avatar" fallback
  };
  typography: {
    heading_font: 'inter' | 'playfair' | 'space-grotesk' | 'fraunces';
    body_font: 'inter' | 'space-grotesk';
  };
  suggested_categories: Array<{
    name: LocalizedString;
    sort_order: number;
  }>;
  sample_items: Array<{
    category_slug: string;
    name: LocalizedString;
    description: LocalizedString;
    price_ron_suggestion: number;
    image_url: string;
  }>;
  pricing_defaults: {
    min_order_ron: number;
    free_delivery_threshold_ron: number;
    delivery_eta_min_minutes: number;
    delivery_eta_max_minutes: number;
  };
  settings_defaults: {
    cod_enabled: boolean;
    pickup_enabled: boolean;
  };
};
