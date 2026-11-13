// Per-tenant payment mode + provider. Resolves which storefront payment
// surfaces are usable for this tenant and which PSP processes card charges.
//
// Iulian directive 2026-05-16 ("exclude stripe. folosim netopia si vivawallets")
// — Stripe is removed from the active payment path. Card flow goes through
// either Netopia or Viva Wallet. The legacy `card_test` mode was renamed to
// `card_sandbox` to reflect the underlying PSP terminology (Netopia/Viva use
// "sandbox" for their non-live environments).
//
// Modes:
//   * cod_only     — only cash-on-delivery; CARD radio hidden, intent returns 422
//   * card_sandbox — Netopia/Viva sandbox card flow with a visible sandbox banner
//   * card_live    — production Netopia/Viva card flow, no banner
//
// Provider (required when mode !== 'cod_only'):
//   * netopia — Netopia Payments (RO-native)
//   * viva    — Viva Wallet
//
// Feature-flagged via PSP_TENANT_TOGGLE_ENABLED. When the flag is OFF we fall
// back to the legacy `settings.cod_enabled` boolean — CARD-always with an
// optional COD radio — so this module is safe to load before any tenant settings
// get migrated.

export type PaymentMode = 'cod_only' | 'card_sandbox' | 'card_live';
export type PaymentProvider = 'netopia' | 'viva';

/**
 * The most cash a courier is asked to handle for one order.
 *
 * Iulian directive 2026-09-09: an order over this amount can only be paid by
 * card. This is not a commercial price — it is a cap on how much cash rides
 * around in one person's bag, so it is platform-wide and not per tenant.
 *
 * It bounds two exposures at once: the float a courier carries to pay the
 * restaurant at pickup, and the amount at risk when a customer does not answer
 * the door. Above the cap the money moves before the food does.
 */
export const COD_MAX_TOTAL_RON = 300;

/**
 * Whether cash on delivery is allowed for a given order total.
 *
 * Checked against the amount the customer actually pays — after delivery fee,
 * promo and loyalty — because that is the sum the courier collects at the door.
 * A non-finite total fails closed.
 */
export function codAllowedForTotal(totalRon: number): boolean {
  if (!Number.isFinite(totalRon)) return false;
  return totalRon <= COD_MAX_TOTAL_RON;
}

const VALID_MODES: PaymentMode[] = ['cod_only', 'card_sandbox', 'card_live'];
const VALID_PROVIDERS: PaymentProvider[] = ['netopia', 'viva'];

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

// Read settings.payments.provider safely. Returns null when missing or unknown;
// `resolvePaymentSurface` defaults to 'netopia' for backward compat with any
// tenant rows that were created before the provider field existed.
export function readPaymentProvider(settings: unknown): PaymentProvider | null {
  if (!settings || typeof settings !== 'object') return null;
  const payments = (settings as Record<string, unknown>).payments;
  if (!payments || typeof payments !== 'object') return null;
  const provider = (payments as Record<string, unknown>).provider;
  if (typeof provider !== 'string') return null;
  return VALID_PROVIDERS.includes(provider as PaymentProvider)
    ? (provider as PaymentProvider)
    : null;
}

// Resolved view used by storefront + checkout intent.
export type ResolvedPayment = {
  mode: PaymentMode;
  // The PSP that will process card payments for this tenant. Only meaningful
  // when cardEnabled is true; defaults to 'netopia' for legacy / unset rows.
  provider: PaymentProvider;
  // Whether the storefront should render the CARD payment radio.
  cardEnabled: boolean;
  // Whether the storefront should render the COD payment radio.
  codEnabled: boolean;
  // Whether to show the "Plată în mod sandbox" banner. True only for card_sandbox.
  showTestBanner: boolean;
};

// Resolve the effective payment surface for a tenant. Honors the feature
// flag: when OFF, behave exactly like before this module landed.
export function resolvePaymentSurface(settings: unknown): ResolvedPayment {
  const codEnabled =
    !!settings &&
    typeof settings === 'object' &&
    (settings as Record<string, unknown>).cod_enabled === true;

  const provider = readPaymentProvider(settings) ?? 'netopia';

  if (!isPspTenantToggleEnabled()) {
    // Legacy: CARD always enabled, COD opt-in via cod_enabled.
    return {
      mode: 'card_live',
      provider,
      cardEnabled: true,
      codEnabled,
      showTestBanner: false,
    };
  }

  const mode = readPaymentMode(settings) ?? 'cod_only';
  if (mode === 'cod_only') {
    return { mode, provider, cardEnabled: false, codEnabled: true, showTestBanner: false };
  }
  if (mode === 'card_sandbox') {
    return { mode, provider, cardEnabled: true, codEnabled, showTestBanner: true };
  }
  // card_live
  return { mode, provider, cardEnabled: true, codEnabled, showTestBanner: false };
}
