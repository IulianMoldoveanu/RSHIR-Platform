'use server';

// Lane WHATSAPP-BUSINESS-API-SKELETON — server actions for the OWNER's
// WhatsApp Business → tenant binding. Mirrors the Hepy/Telegram binding
// pattern (apps/restaurant-admin/src/app/dashboard/settings/hepy/actions.ts)
// so the two channels feel identical to the OWNER.
//
// Flow:
//   1. OWNER lands on /dashboard/settings/whatsapp and clicks
//      "Generează link" → server action mints a 32-byte URL-safe nonce,
//      stores (nonce, tenant_id, owner_user_id) in whatsapp_connect_nonces
//      with a 1h TTL, returns wa.me/<biz_phone>?text=connect%20<nonce>.
//   2. OWNER taps the link from the phone with WhatsApp installed,
//      sends "connect <nonce>". The whatsapp-webhook Edge Function
//      consumes the nonce, writes whatsapp_owner_bindings.
//   3. From step 2 onwards, every message from that wa_phone_number is
//      auto-scoped to the bound tenant.
//
// Security:
//   - OWNER-only (STAFF / FLEET_MANAGER cannot bind).
//   - Service-role for all writes (bypasses RLS).
//   - Soft rate limit: max 10 unconsumed nonces per OWNER per 24h.
//   - Expected tenant id passed from the client to defend against tenant
//     drift between page load and click.

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';

const REVALIDATE = '/dashboard/settings/whatsapp';
const NONCE_TTL_MS = 60 * 60 * 1000; // 1h
const NONCE_RATE_LIMIT_24H = 10;

export type WhatsAppConnectResult =
  | { ok: true; url: string; expires_in_seconds: number; biz_phone: string | null }
  | {
      ok: false;
      error:
        | 'unauthenticated'
        | 'forbidden_owner_only'
        | 'forbidden_tenant_mismatch'
        | 'rate_limited'
        | 'biz_phone_not_configured'
        | 'db_error';
      detail?: string;
    };

export type WhatsAppUnbindResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | 'unauthenticated'
        | 'forbidden_owner_only'
        | 'forbidden_tenant_mismatch'
        | 'not_bound'
        | 'db_error';
      detail?: string;
    };

// Business WhatsApp number (E.164, no +) used in wa.me deep-links. Set
// only after Meta approval lands. Until then, generateConnectLink
// returns biz_phone_not_configured and the UI explains the wait.
function bizPhone(): string | null {
  const v = process.env.NEXT_PUBLIC_HIR_WHATSAPP_BIZ_PHONE;
  if (!v) return null;
  const trimmed = v.replace(/[^0-9]/g, '');
  return trimmed.length >= 8 ? trimmed : null;
}

function buildConnectUrl(phone: string, nonce: string): string {
  // wa.me prefills the message body — OWNER taps Send to fire it.
  return `https://wa.me/${phone}?text=${encodeURIComponent(`connect ${nonce}`)}`;
}

// ────────────────────────────────────────────────────────────
// generateConnectLink — OWNER mints a fresh deep-link.
// ────────────────────────────────────────────────────────────

export async function generateConnectLink(input: {
  expectedTenantId: string;
}): Promise<WhatsAppConnectResult> {
  let active;
  try {
    active = await getActiveTenant();
  } catch {
    return { ok: false, error: 'unauthenticated' };
  }
  const { user, tenant } = active;
  if (!input.expectedTenantId || tenant.id !== input.expectedTenantId) {
    return { ok: false, error: 'forbidden_tenant_mismatch' };
  }
  const role = await getTenantRole(user.id, tenant.id).catch(() => null);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  const phone = bizPhone();
  if (!phone) return { ok: false, error: 'biz_phone_not_configured' };

  const admin = createAdminClient();
  // whatsapp_* tables ship in migration 20260608_003 and won't be in the
  // generated supabase types until the next gen-types run.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  // Soft rate-limit: count the OWNER's unconsumed nonces in the last 24h.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recentCount, error: rlErr } = await sb
    .from('whatsapp_connect_nonces')
    .select('nonce', { count: 'exact', head: true })
    .eq('owner_user_id', user.id)
    .gte('created_at', since);
  if (rlErr) {
    console.error('[whatsapp] rate-limit check failed', rlErr.message);
    return { ok: false, error: 'db_error' };
  }
  if ((recentCount ?? 0) >= NONCE_RATE_LIMIT_24H) {
    return { ok: false, error: 'rate_limited' };
  }

  // 32 random bytes → ~43-char URL-safe string.
  const nonce = randomBytes(32).toString('base64url');

  const { error: insErr } = await sb.from('whatsapp_connect_nonces').insert({
    nonce,
    tenant_id: tenant.id,
    owner_user_id: user.id,
  });
  if (insErr) {
    console.error('[whatsapp] nonce insert failed', insErr.message);
    return { ok: false, error: 'db_error', detail: insErr.message };
  }

  await logAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: 'whatsapp.connect_link_generated',
    entityType: 'whatsapp_connect_nonce',
    entityId: nonce.slice(0, 12),
  });

  revalidatePath(REVALIDATE);
  return {
    ok: true,
    url: buildConnectUrl(phone, nonce),
    expires_in_seconds: Math.floor(NONCE_TTL_MS / 1000),
    biz_phone: phone,
  };
}

// ────────────────────────────────────────────────────────────
// unbindWhatsApp — OWNER terminates an active binding.
// ────────────────────────────────────────────────────────────

export async function unbindWhatsApp(input: {
  bindingId: string;
  expectedTenantId: string;
}): Promise<WhatsAppUnbindResult> {
  let active;
  try {
    active = await getActiveTenant();
  } catch {
    return { ok: false, error: 'unauthenticated' };
  }
  const { user, tenant } = active;
  if (!input.expectedTenantId || tenant.id !== input.expectedTenantId) {
    return { ok: false, error: 'forbidden_tenant_mismatch' };
  }
  const role = await getTenantRole(user.id, tenant.id).catch(() => null);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { data: updated, error } = await sb
    .from('whatsapp_owner_bindings')
    .update({ unbound_at: new Date().toISOString() })
    .eq('id', input.bindingId)
    .eq('owner_user_id', user.id)
    .eq('tenant_id', tenant.id)
    .is('unbound_at', null)
    .select('id, wa_phone_number')
    .maybeSingle();

  if (error) {
    console.error('[whatsapp] unbind failed', error.message);
    return { ok: false, error: 'db_error', detail: error.message };
  }
  if (!updated) return { ok: false, error: 'not_bound' };

  await logAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: 'whatsapp.unbound',
    entityType: 'whatsapp_owner_binding',
    entityId: input.bindingId,
    metadata: { wa_phone_number: updated.wa_phone_number },
  });

  revalidatePath(REVALIDATE);
  return { ok: true };
}
