import type { Locale } from './i18n';

export function formatRon(amount: number, locale: Locale = 'ro'): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'ro-RO', {
    style: 'currency',
    currency: 'RON',
    maximumFractionDigits: 2,
  }).format(amount);
}
