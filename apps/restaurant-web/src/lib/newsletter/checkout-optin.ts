import 'server-only';
import { randomBytes, createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@hir/supabase-types';
import { sendEmail } from './resend';
import { welcomeEmail } from './templates';
import { brandingFor, tenantBaseUrl } from '@/lib/tenant';

// Lane L PR 1 — checkout-time newsletter opt-in. Skips the double-opt-in
// dance (the customer ticked the box during their own checkout, intent is
// explicit) and immediately issues a one-time WELCOME-<8 char> code.
//
// Idempotency: re-running for the same (tenant, email) returns the existing
// unused WELCOME code instead of creating a new one. Keeps the API safe to
// call from a retry path (Stripe webhook, idempotency-keyed POST, etc).

const WELCOME_PREFIX = 'WELCOME-';
const WELCOME_DISCOUNT_PCT = 10;
const WELCOME_TTL_DAYS = 30;

function shortToken(): string {
  // 8 chars, base32-ish from random bytes. Avoid 0/O/1/I to keep manual entry
  // unambiguous on a phone keyboard.
  const ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const buf = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += ALPHA[buf[i]! % ALPHA.length];
  return out;
}

type EnsureResult =
  | { ok: true; code: string; reused: boolean }
  | { ok: false; reason: string };

/**
 * Ensures a per-email WELCOME-<random> 10% code exists for this tenant +
 * email. If one already exists and is unused (used_count = 0), returns it.
 * Otherwise creates a fresh code with usage_limit = 1 + 30-day TTL.
 *
 * The caller is responsible for sending the email (see `sendCheckoutWelcomeEmail`).
 */
export async function ensurePerEmailWelcomeCode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<Database> | any,
  tenantId: string,
  email: string,
): Promise<EnsureResult> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { ok: false, reason: 'invalid_email' };
  }

  // Defensive lookup: prefer the customer_email column (post-migration); on
  // 'column does not exist' fall back to a no-op so the request still succeeds
  // (we just won't issue a code yet — the migration is queued post-merge).
  const COLS = 'id, code, used_count, expires_at';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let existing: any = null;
  try {
    const { data } = await admin
      .from('promo_codes')
      .select(COLS)
      .eq('tenant_id', tenantId)
      .eq('customer_email', normalized)
      .like('code', `${WELCOME_PREFIX}%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    existing = data;
  } catch {
    // Migration not applied yet — treat as no existing code; we'll fall
    // through and try to insert below (the insert will also fail until
    // migrated, in which case we surface a soft error).
  }

  if (existing && existing.used_count === 0) {
    const expires = existing.expires_at ? Date.parse(existing.expires_at) : 0;
    if (!expires || expires > Date.now()) {
      return { ok: true, code: existing.code, reused: true };
    }
  }

  const code = `${WELCOME_PREFIX}${shortToken()}`;
  const validUntil = new Date(Date.now() + WELCOME_TTL_DAYS * 24 * 60 * 60 * 1000);

  // Strategy v2: schema-additive columns may not exist yet on prod when this
  // ships. We try the full insert first; on 'column does not exist' we
  // retry with the legacy column set so the customer at least gets a tenant-
  // wide code (worse but not broken). The migration auto-applies post-merge.
  const FULL: Record<string, unknown> = {
    tenant_id: tenantId,
    code,
    kind: 'PERCENT',
    value_int: WELCOME_DISCOUNT_PCT,
    min_order_ron: 0,
    max_uses: 1,
    usage_limit: 1,
    customer_email: normalized,
    valid_until: validUntil.toISOString(),
    is_active: true,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let { error } = await admin.from('promo_codes').insert(FULL as any);
  if (error && /(customer_email|usage_limit)/i.test(error.message ?? '')) {
    const LEGACY: Record<string, unknown> = {
      tenant_id: tenantId,
      code,
      kind: 'PERCENT',
      value_int: WELCOME_DISCOUNT_PCT,
      min_order_ron: 0,
      max_uses: 1,
      valid_until: validUntil.toISOString(),
      is_active: true,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ error } = await admin.from('promo_codes').insert(LEGACY as any));
  }
  if (error) {
    console.error('[checkout-optin] promo insert failed', error.message);
    return { ok: false, reason: 'promo_insert_failed' };
  }
  return { ok: true, code, reused: false };
}

/**
 * Idempotently captures a checkout-newsletter signup row. Best-effort —
 * a duplicate-row failure is not surfaced to the caller. Source 'checkout'
 * distinguishes from the existing 'menu_empty' surface.
 */
export async function recordCheckoutSignup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<Database> | any,
  args: { tenantSlug: string; email: string; ip: string | null },
): Promise<void> {
  const normalized = args.email.trim().toLowerCase();
  // Dedupe: if a row already exists for this slug+email+source we skip.
  try {
    const { data: existing } = await admin
      .from('storefront_notify_signups')
      .select('id')
      .eq('tenant_slug', args.tenantSlug)
      .eq('email', normalized)
      .eq('source', 'checkout')
      .maybeSingle();
    if (existing) return;
  } catch {
    /* fall through and try insert; errors are best-effort */
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertWithSource: Record<string, unknown> = {
    tenant_slug: args.tenantSlug,
    email: normalized,
    source: 'checkout',
    ip: args.ip,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let { error } = await admin.from('storefront_notify_signups').insert(insertWithSource as any);
  if (error && /source/i.test(error.message ?? '')) {
    // Pre-migration fallback — drop source column.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ error } = await admin.from('storefront_notify_signups').insert({
      tenant_slug: args.tenantSlug,
      email: normalized,
      ip: args.ip,
    } as any));
  }
  if (error) {
    console.error('[checkout-optin] signup insert failed', error.message);
  }
}

/**
 * Sends the post-checkout WELCOME email. Best-effort: a Resend failure is
 * logged but doesn't bubble — the order has already succeeded by the time
 * this runs and we don't want to nuke the response.
 */
export async function sendCheckoutWelcomeEmail(args: {
  email: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tenant: { name: string; settings: any };
  promoCode: string;
}): Promise<void> {
  const { logoUrl, brandColor } = brandingFor(args.tenant.settings);
  const baseUrl = tenantBaseUrl();
  // No real unsubscribe token (the customer never subscribed to anything
  // recurring — they got a one-time discount code). The legacy footer in the
  // welcomeEmail template still wants a URL; point at /?subscribed=invalid
  // which is the existing "no-op" landing.
  const unsubscribeUrl = `${baseUrl}/?from=welcome`;
  const tpl = welcomeEmail({
    brand: { name: args.tenant.name, logoUrl, brandColor },
    promoCode: args.promoCode,
    unsubscribeUrl,
  });
  const sent = await sendEmail({
    to: args.email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
  });
  if (!sent.ok) {
    console.error('[checkout-optin] welcome email failed', sent.reason, sent.detail);
  }
}

export const WELCOME_DISCOUNT_PCT_EXPORT = WELCOME_DISCOUNT_PCT;
export const WELCOME_TTL_DAYS_EXPORT = WELCOME_TTL_DAYS;
