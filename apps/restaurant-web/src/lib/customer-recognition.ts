import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { getConsent } from './consent.server';

export const CUSTOMER_COOKIE_PREFIX = 'hir-customer-';
export const CART_BOOTSTRAP_COOKIE_PREFIX = 'hir-cart-bootstrap-';
export const CUSTOMER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 180 days
export const CART_BOOTSTRAP_COOKIE_MAX_AGE_SECONDS = 60 * 5; // 5 minutes — handoff window

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function customerCookieName(tenantId: string): string {
  return `${CUSTOMER_COOKIE_PREFIX}${tenantId}`;
}

export function cartBootstrapCookieName(tenantId: string): string {
  return `${CART_BOOTSTRAP_COOKIE_PREFIX}${tenantId}`;
}

/**
 * Reads the per-tenant customer recognition cookie. Server-only.
 * Returns the customer.id (UUID) if present and well-formed.
 */
export function readCustomerCookie(tenantId: string): string | null {
  const v = cookies().get(customerCookieName(tenantId))?.value;
  return v && UUID_RE.test(v) ? v : null;
}

/**
 * Sets the customer recognition cookie on a response. Consent-aware:
 * skipped when the user explicitly chose "essential only" via the
 * RSHIR-27 consent banner. When consent is `all` or undecided we treat
 * recognition as functional (not analytics) and persist it.
 */
export function maybeSetCustomerCookie(
  res: NextResponse,
  tenantId: string,
  customerId: string,
): void {
  // Skip the recognition cookie only when the user has *explicitly* declined
  // analytics. Undecided (null) is treated as functional, mirroring the
  // pre-RSHIR-27 behaviour: recognition makes "Bun-revenit, {nume}" work and
  // is core UX, but we still respect a hard "no" once the user opts into
  // essential-only via the consent banner.
  const consent = getConsent();
  if (consent && consent.analytics === false) return;
  res.cookies.set({
    name: customerCookieName(tenantId),
    value: customerId,
    maxAge: CUSTOMER_COOKIE_MAX_AGE_SECONDS,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // RSHIR-37: cookie is read only on the server (account/page.tsx +
    // account/actions.ts + intent/route.ts). Lock it down so an XSS
    // landing on the storefront cannot exfiltrate the customer.id.
    httpOnly: true,
  });
}
