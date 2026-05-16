// Partner v3 — hashing helpers (single source for Tracks B/D/E).
//
// Server-only — uses node:crypto. Don't import from browser code.
//
// Spec: apps/restaurant-admin/src/lib/partner-v3-spec.md

import { createHash } from 'node:crypto';

/**
 * Hash a (phone, email, CUI) triple to a stable identifier for deal-registration
 * deduplication. Same triple always yields the same hash, so two resellers
 * pitching the same restaurant collide on the partial-unique-active lock.
 *
 * Normalization: lower-case, strip whitespace, keep alphanumeric + @ . +
 */
export function contactHash(
  phone: string | null | undefined,
  email: string | null | undefined,
  cui: string | null | undefined,
): string {
  const norm = (s: string | null | undefined) =>
    (s ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9@.+]/g, '');
  const joined = `${norm(phone)}|${norm(email)}|${norm(cui)}`;
  return createHash('sha256').update(joined).digest('hex');
}

/**
 * Lazy-generate a stable 8-char champion referral code from a tenant id.
 * Used in /dashboard/champion + champion-referral-credit attribution flow.
 */
export function championCode(tenantId: string): string {
  const h = createHash('sha256').update(tenantId).digest('base64');
  return h.replace(/[+/=]/g, '').slice(0, 8).toUpperCase();
}

/**
 * Hash a 13-digit CNP for KYC storage. Raw CNP is never persisted; admin
 * verifies by re-hashing input and comparing.
 */
export function cnpHash(cnp: string): string {
  const digits = cnp.replace(/\D/g, '');
  if (digits.length !== 13) {
    throw new Error('CNP must contain exactly 13 digits');
  }
  return createHash('sha256').update(digits).digest('hex');
}
