// Fiscal config lives inside tenants.settings.fiscal (jsonb) so we can ship
// the SmartBill / SAGA export without a schema migration. Writes go through
// the OWNER-gated server action; reads are best-effort (defaults applied
// when fields are missing).
//
// Shape:
//   settings.fiscal = {
//     legal_name?: string,   // exact name registered at ONRC; falls back to tenant.name
//     cui?: string,          // Romanian CUI / VAT number (without "RO" prefix); blank for B2C-only
//     vat_rate_pct?: number, // default 9 (RO HoReCa); editable for businesses on a different rate
//   }

export type TenantFiscal = {
  legal_name: string;
  cui: string;
  vat_rate_pct: number;
};

const DEFAULT_VAT_RATE_PCT = 9;

const ALLOWED_VAT_RATES = [0, 5, 9, 19] as const;

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
    vat_rate_pct: ALLOWED_VAT_RATES.includes(vatRaw as 0 | 5 | 9 | 19)
      ? vatRaw
      : DEFAULT_VAT_RATE_PCT,
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
  return ALLOWED_VAT_RATES.includes(n as 0 | 5 | 9 | 19);
}

export const VAT_RATE_OPTIONS: ReadonlyArray<number> = ALLOWED_VAT_RATES;
