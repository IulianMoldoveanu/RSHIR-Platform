// Fiscal config lives inside tenants.settings.fiscal (jsonb) so we can ship
// the SmartBill / SAGA export without a schema migration. Writes go through
// the OWNER-gated server action; reads are best-effort (defaults applied
// when fields are missing).
//
// Shape:
//   settings.fiscal = {
//     legal_name?: string,   // exact name registered at ONRC; falls back to tenant.name
//     cui?: string,          // Romanian CUI / VAT number (without "RO" prefix); blank for B2C-only
//     vat_rate_pct?: number, // default 11 (RO HoReCa post-2025-08-01); editable
//   }
//
// VAT rates: Romania raised the reduced rate from 9% → 11% and the standard
// rate from 19% → 21% on 2025-08-01 (Legea 141/2025). Historical rates
// (5/9/19) remain in the allowed list so tenants exporting older months
// can still pick the rate that was in force at the time. Caught by Codex
// round 3 P1 on PR #286.

export type TenantFiscal = {
  legal_name: string;
  cui: string;
  vat_rate_pct: number;
};

// Current default = 11% (RO HoReCa reduced rate after 2025-08-01 hike).
const DEFAULT_VAT_RATE_PCT = 11;

// Includes both current (0/5/11/21) and historical (9/19) rates so old-month
// exports remain accurate. Pre-2025-08-01 reduced rate was 9%, standard 19%.
const ALLOWED_VAT_RATES = [0, 5, 9, 11, 19, 21] as const;
type AllowedVatRate = (typeof ALLOWED_VAT_RATES)[number];

function isAllowedVatRate(n: number): n is AllowedVatRate {
  return (ALLOWED_VAT_RATES as readonly number[]).includes(n);
}

export function readFiscal(
  settings: unknown,
  fallbackName: string,
): TenantFiscal {
  const fiscal =
    settings && typeof settings === 'object' && 'fiscal' in settings
      ? (settings as { fiscal?: unknown }).fiscal
      : null;
  const obj = fiscal && typeof fiscal === 'object' ? (fiscal as Record<string, unknown>) : {};
  const legalNameRaw = typeof obj.legal_name === 'string' ? obj.legal_name.trim() : '';
  const cuiRaw = typeof obj.cui === 'string' ? obj.cui.trim() : '';
  const vatRaw = typeof obj.vat_rate_pct === 'number' ? obj.vat_rate_pct : DEFAULT_VAT_RATE_PCT;
  return {
    legal_name: legalNameRaw || fallbackName,
    cui: cuiRaw,
    vat_rate_pct: isAllowedVatRate(vatRaw) ? vatRaw : DEFAULT_VAT_RATE_PCT,
  };
}

// Romanian CUI format: optional "RO" prefix + 2-10 digits. We strip the
// prefix on save so the stored value is the bare number; output reattaches
// "RO" when SmartBill expects it. Empty string is allowed (B2C-only).
const CUI_RE = /^(RO)?\d{2,10}$/i;

export function normalizeCui(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return '';
  if (!CUI_RE.test(trimmed)) return null;
  return trimmed.toUpperCase().replace(/^RO/, '');
}

export function isValidVatRate(n: number): boolean {
  return isAllowedVatRate(n);
}

export const VAT_RATE_OPTIONS: ReadonlyArray<number> = ALLOWED_VAT_RATES;
