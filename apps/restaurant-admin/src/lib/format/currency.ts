/**
 * Currency formatting helper for the admin dashboard.
 *
 * `formatPrice` is the general-purpose helper: it takes an amount in the
 * smallest currency unit (bani for RON, cents for EUR/USD etc.), a
 * currency code (ISO 4217), and an optional BCP-47 locale tag.
 *
 * For legacy code that always deals with RON amounts expressed as a decimal
 * float (e.g. `total_ron` columns), import `formatRon` directly from
 * `@hir/ui` instead — it handles the decimal-float case.
 */

/**
 * Format `amountBani` (integer smallest unit — bani for RON, cents for EUR)
 * into a localised currency string using `Intl.NumberFormat`.
 *
 * @param amountBani  Integer amount in smallest unit (e.g. 1250 = 12.50 RON)
 * @param currencyCode  ISO 4217 code, defaults to 'RON'
 * @param locale  BCP-47 locale tag, defaults to 'ro-RO'
 */
export function formatPrice(
  amountBani: number,
  currencyCode: string = 'RON',
  locale: string = 'ro-RO',
): string {
  const n = Number.isFinite(amountBani) ? amountBani : 0;
  // Intl.NumberFormat always works in the major unit (e.g. lei, not bani).
  const majorUnit = n / 100;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 2,
  }).format(majorUnit);
}
