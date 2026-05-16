// Per-tenant payment mode. Resolves which storefront payment surfaces are
// usable for this tenant:
//   * cod_only  — only cash-on-delivery; CARD radio hidden, intent returns 422
//   * card_test — Stripe TEST mode card flow with a visible demo banner
//   * card_live — production Stripe / Netopia / Viva card flow, no banner
//
// Feature-flagged via PSP_TENANT_TOGGLE_ENABLED. When the flag is OFF we fall
// back to the legacy `settings.cod_enabled` boolean — CARD-always with an
// optional COD radio — so this PR is safe to merge before any tenant settings
// get migrated.

export type PaymentMode = 'cod_only' | 'card_test' | 'card_live';

const VALID_MODES: PaymentMode[] = ['cod_only', 'card_test', 'card_live'];

export function isPspTenantToggleEnabled(): boolean {
  return process.env.PSP_TENANT_TOGGLE_ENABLED === 'true';
}

// Read settings.payments.mode safely from an unknown tenant.settings blob.
// Returns null when the field is missing or not one of the known modes — the
// caller picks the legacy fallback.
export function readPaymentMode(settings: unknown): PaymentMode | null {
  if (!settings || typeof settings !== 'object') return null;
  const payments = (settings as Record<string, unknown>).payments;
  if (!payments || typeof payments !== 'object') return null;
  const mode = (payments as Record<string, unknown>).mode;
  if (typeof mode !== 'string') return null;
  return VALID_MODES.includes(mode as PaymentMode) ? (mode as PaymentMode) : null;
}

// Resolved view used by storefront + checkout intent.
export type ResolvedPayment = {
  mode: PaymentMode;
  // Whether the storefront should render the CARD payment radio.
  cardEnabled: boolean;
  // Whether the storefront should render the COD payment radio.
  codEnabled: boolean;
  // Whether to show the "Plată în mod demo" banner. True only for card_test.
  showTestBanner: boolean;
};

// Resolve the effective payment surface for a tenant. Honors the feature
// flag: when OFF, behave exactly like before this PR.
export function resolvePaymentSurface(settings: unknown): ResolvedPayment {
  const codEnabled =
    !!settings &&
    typeof settings === 'object' &&
    (settings as Record<string, unknown>).cod_enabled === true;

  if (!isPspTenantToggleEnabled()) {
    // Legacy: CARD always enabled, COD opt-in via cod_enabled.
    return {
      mode: 'card_live',
      cardEnabled: true,
      codEnabled,
      showTestBanner: false,
    };
  }

  const mode = readPaymentMode(settings) ?? 'cod_only';
  if (mode === 'cod_only') {
    return { mode, cardEnabled: false, codEnabled: true, showTestBanner: false };
  }
  if (mode === 'card_test') {
    return { mode, cardEnabled: true, codEnabled, showTestBanner: true };
  }
  // card_live
  return { mode, cardEnabled: true, codEnabled, showTestBanner: false };
}
