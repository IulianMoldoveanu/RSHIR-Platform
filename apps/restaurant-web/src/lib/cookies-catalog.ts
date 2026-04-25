import type { Locale } from './i18n';

export type CookieCategory = 'essential' | 'analytics';

export type CatalogEntry = {
  name: string;
  category: CookieCategory;
  purpose: { ro: string; en: string };
  lifetime: { ro: string; en: string };
};

export const COOKIES_CATALOG: readonly CatalogEntry[] = [
  {
    name: 'hir-cart-{tenantId}',
    category: 'essential',
    purpose: {
      ro: 'Reține produsele din coș pentru tenant.',
      en: 'Keeps the cart contents for the tenant.',
    },
    lifetime: { ro: '30 de zile', en: '30 days' },
  },
  {
    name: 'hir-customer-{tenantId}',
    category: 'essential',
    purpose: {
      ro: 'Recunoaște dispozitivul ca cel folosit la o comandă anterioară pentru a afișa istoricul comenzilor în Contul tău.',
      en: 'Recognises this device as the one used for a previous order to show your order history under My orders.',
    },
    lifetime: { ro: '180 de zile', en: '180 days' },
  },
  {
    name: 'hir_locale',
    category: 'essential',
    purpose: {
      ro: 'Limba afișată (RO / EN).',
      en: 'Displayed language (RO / EN).',
    },
    lifetime: { ro: '1 an', en: '1 year' },
  },
  {
    name: 'hir_consent',
    category: 'essential',
    purpose: {
      ro: 'Reține opțiunea ta cu privire la cookie-urile opționale.',
      en: 'Stores your choice about optional cookies.',
    },
    lifetime: { ro: '180 de zile', en: '180 days' },
  },
  {
    name: '__stripe_mid / __stripe_sid',
    category: 'essential',
    purpose: {
      ro: 'Folosite de Stripe pentru prevenirea fraudei la plată.',
      en: 'Used by Stripe to prevent payment fraud.',
    },
    lifetime: { ro: 'sesiune / 1 an', en: 'session / 1 year' },
  },
  {
    name: '_pa / _ga (planificat)',
    category: 'analytics',
    purpose: {
      ro: 'Analiză de trafic agregată. Activate doar dacă accepți toate cookie-urile.',
      en: 'Aggregated traffic analytics. Only enabled if you accept all cookies.',
    },
    lifetime: { ro: '1 an', en: '1 year' },
  },
] as const;

export function catalogCount(): number {
  return COOKIES_CATALOG.length;
}

export function pickPurpose(entry: CatalogEntry, locale: Locale): string {
  return entry.purpose[locale];
}

export function pickLifetime(entry: CatalogEntry, locale: Locale): string {
  return entry.lifetime[locale];
}
