import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies, type UnsafeUnwrappedCookies } from 'next/headers';
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

// ── Cookie signing ──────────────────────────────────────────────────────
// This cookie is a bearer credential, not a hint: on its own it unlocks the
// /account page (order history, saved addresses, loyalty balance), prefills
// checkout with the customer's name/phone/address, and authorises spending
// loyalty points at checkout. Until now its value was the bare customers.id
// UUID, so anyone who learned a valid UUID for a tenant could paste it into
// their own browser and become that customer. httpOnly stops a script on the
// page from reading it, but nothing stopped an attacker from *writing* one.
//
// Value is now `<uuid>.<hmac>`, the HMAC covering `<tenantId>.<customerId>`
// so a cookie minted for one tenant can never be replayed against another
// even if the cookie name scheme changes.
//
// Existing unsigned cookies (no `.`) are rejected — a returning visitor is
// simply no longer recognised until their next login or order. Accepting
// them during a grace period would defeat the whole change, since forging
// one is exactly the case being closed.

// Read lazily rather than captured at module load: Next evaluates modules at
// build time too, where the value may not be injected yet.
function cookieSecret(): string {
  return process.env.CUSTOMER_COOKIE_SECRET ?? '';
}

function signCustomerId(tenantId: string, customerId: string): string {
  return createHmac('sha256', cookieSecret())
    .update(`${tenantId}.${customerId}`)
    .digest('base64url');
}

/**
 * Builds the signed cookie value for a customer. Returns null when
 * CUSTOMER_COOKIE_SECRET is unset — recognition then degrades to "nobody is
 * ever recognised" rather than falling back to an unsigned, forgeable value.
 * /api/healthz reports whether the secret is configured.
 */
export function customerCookieValue(tenantId: string, customerId: string): string | null {
  if (!cookieSecret()) return null;
  return `${customerId}.${signCustomerId(tenantId, customerId)}`;
}

export function cartBootstrapCookieName(tenantId: string): string {
  return `${CART_BOOTSTRAP_COOKIE_PREFIX}${tenantId}`;
}

/**
 * Reads the per-tenant customer recognition cookie. Server-only.
 * Returns the customer.id (UUID) only when the cookie carries a valid
 * signature for THIS tenant; otherwise null.
 */
export function readCustomerCookie(tenantId: string): string | null {
  if (!cookieSecret()) return null;
  const v = (cookies() as unknown as UnsafeUnwrappedCookies).get(customerCookieName(tenantId))?.value;
  if (!v) return null;

  // A UUID contains no '.', so the first dot always separates id from signature.
  const dot = v.indexOf('.');
  if (dot < 0) return null; // legacy unsigned cookie, or a forgery attempt
  const customerId = v.slice(0, dot);
  if (!UUID_RE.test(customerId)) return null;

  const got = Buffer.from(v.slice(dot + 1));
  const expected = Buffer.from(signCustomerId(tenantId, customerId));
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  return customerId;
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
  const value = customerCookieValue(tenantId, customerId);
  if (!value) return;
  res.cookies.set({
    name: customerCookieName(tenantId),
    value,
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
