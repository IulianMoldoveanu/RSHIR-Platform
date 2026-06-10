/**
 * Single source of truth for the HIR courier support phone.
 *
 * Couriers must ALWAYS be able to reach a real number. The app previously
 * rendered three different numbers (+40 21 204 0000, +40 21 300 0000) plus a
 * literal "+40-xxx-xxx-xxx" placeholder across help, messages and the support
 * chat — so the last-resort "call us" button could dial a dead/placeholder
 * line. The real support line on the public HIR sites is 0743 700 916.
 *
 * Override the dialable number per-deploy with NEXT_PUBLIC_HIR_SUPPORT_PHONE
 * (E.164, e.g. +40743700916). Never render a placeholder — if you need to gate,
 * check `hasSupportPhone`.
 */
const FALLBACK_E164 = '+40743700916';

export const SUPPORT_PHONE_E164 = process.env.NEXT_PUBLIC_HIR_SUPPORT_PHONE ?? FALLBACK_E164;

/** Human-readable form for display next to the call button. */
export const SUPPORT_PHONE_DISPLAY =
  SUPPORT_PHONE_E164 === FALLBACK_E164 ? '0743 700 916' : SUPPORT_PHONE_E164;

export const SUPPORT_HOURS = 'L–V 09–18';

/** Always true with the fallback; kept so callers can hide the button if a
 *  future deploy explicitly unsets the number. */
export const hasSupportPhone = Boolean(SUPPORT_PHONE_E164);
