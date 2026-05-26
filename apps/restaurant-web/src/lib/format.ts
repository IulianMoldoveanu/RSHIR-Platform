import { formatRon as sharedFormatRon } from '@hir/ui';
import type { Locale } from './i18n';

/**
 * Thin app-local wrapper that bridges the typed Locale union to the
 * BCP47-string API in @hir/ui. Use this from web app code; @hir/ui is
 * the single source of truth for the Intl.NumberFormat call itself.
 */
export function formatRon(amount: number, locale: Locale = 'ro'): string {
  return sharedFormatRon(amount, locale === 'en' ? 'en-GB' : 'ro-RO');
}
