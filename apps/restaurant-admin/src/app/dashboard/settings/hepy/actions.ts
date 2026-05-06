'use server';

// Lane HEPY-PRB — server actions for the OWNER's Telegram → tenant
// binding to the Hepy bot.
//
// Flow:
//   1. OWNER lands on /dashboard/settings/hepy and clicks "Conectează
//      Telegram" → server action mints a 32-byte URL-safe nonce, stores
//      (nonce, tenant_id, owner_user_id) in hepy_connect_nonces with a
//      1h TTL, returns t.me/<bot>?start=connect_<nonce>.
//   2. OWNER taps the link in Telegram. The bot consumes the nonce,
//      writes hepy_owner_bindings(telegram_user_id, tenant_id, owner_user_id),
//      replies "✅ Hepy este conectat la <tenant>".
//   3. From step 2 onwards, every message from that Telegram account is
//      auto-scoped to that tenant (read-only intents in PR B).
//
// Security:
//   - OWNER-only (STAFF cannot bind).
//   - Service-role for all writes (bypasses RLS).
//   - Issue-and-replace: minting a new nonce does NOT invalidate prior
//     unconsumed nonces explicitly (they expire on their own at 1h);
//     consuming any one of them rebinds and unbinds prior active TG.
//   - Expected tenant id passed from the client to defend against tenant
//     drift between page load and click.

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';

const REVALIDATE = '/dashboard/settings/hepy';
const NONCE_TTL_MS = 60 * 60 * 1000; // 1h
// Soft rate-limit: max 10 unconsumed nonces in any rolling 24h, per OWNER.
const NONCE_RATE_LIMIT_24H = 10;

export type HepyConnectResult =
  | { ok: true; url: string; expires_in_seconds: number }
  | {
      ok: false;
      error:
        | 'unauthenticated'
        | 'forbidden_owner_only'
        | 'forbidden_tenant_mismatch'
        | 'rate_limited'
        | 'db_error';
      detail?: string;
    };

export type HepyUnbindResult =
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

function botUsername(): string {
  return process.env.NEXT_PUBLIC_HEPY_BOT_USERNAME ?? 'MasterHIRbot';
}

function buildConnectUrl(nonce: string): string {
  return `https://t.me/${botUsername()}?start=connect_${nonce}`;
}

// ────────────────────────────────────────────────────────────
// generateConnectLink — OWNER mints a fresh deep-link.
// ────────────────────────────────────────────────────────────

export async function generateConnectLink(input: {
  expectedTenantId: string;
}): Promise<HepyConnectResult> {
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
  // hepy_* tables ship in migration 20260507_009 and won't be in the
  // generated supabase types until the next gen-types run. Cast through
  // unknown so tsc accepts the call regardless.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  // Soft rate-limit: count the OWNER's unconsumed nonces in the last 24h.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recentCount, error: rlErr } = await sb
    .from('hepy_connect_nonces')
    .select('nonce', { count: 'exact', head: true })
    .eq('owner_user_id', user.id)
    .gte('created_at', since);
  if (rlErr) {
    console.error('[hepy] rate-limit check failed', rlErr.message);
    return { ok: false, error: 'db_error' };
  }
  if ((recentCount ?? 0) >= NONCE_RATE_LIMIT_24H) {
    return { ok: false, error: 'rate_limited' };
  }

  // 32 random bytes → ~43-char URL-safe string. Telegram start payload
  // limit is 64 chars; "connect_" + 43 = 51, well within bound.
  const nonce = randomBytes(32).toString('base64url');

  const { error: insErr } = await sb.from('hepy_connect_nonces').insert({
    nonce,
    tenant_id: tenant.id,
    owner_user_id: user.id,
  });
  if (insErr) {
    console.error('[hepy] nonce insert failed', insErr.message);
    return { ok: false, error: 'db_error', detail: insErr.message };
  }

  await logAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: 'hepy.telegram_connect_link_generated',
    entityType: 'hepy_connect_nonce',
    entityId: nonce.slice(0, 12),
  });

  revalidatePath(REVALIDATE);
  return {
    ok: true,
    url: buildConnectUrl(nonce),
    expires_in_seconds: Math.floor(NONCE_TTL_MS / 1000),
  };
}

// ────────────────────────────────────────────────────────────
// unbindTelegram — OWNER terminates an active binding.
// ────────────────────────────────────────────────────────────

export async function unbindTelegram(input: {
  bindingId: string;
  expectedTenantId: string;
}): Promise<HepyUnbindResult> {
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

  // Defend against another OWNER's binding id being passed in: the row
  // we update MUST belong to (this OWNER, this tenant) and be still
  // active. The .select returns 0 rows on mismatch and we map to
  // not_bound.
  const { data: updated, error } = await sb
    .from('hepy_owner_bindings')
    .update({ unbound_at: new Date().toISOString() })
    .eq('id', input.bindingId)
    .eq('owner_user_id', user.id)
    .eq('tenant_id', tenant.id)
    .is('unbound_at', null)
    .select('id, telegram_user_id')
    .maybeSingle();

  if (error) {
    console.error('[hepy] unbind failed', error.message);
    return { ok: false, error: 'db_error', detail: error.message };
  }
  if (!updated) return { ok: false, error: 'not_bound' };

  await logAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: 'hepy.telegram_unbound',
    entityType: 'hepy_owner_binding',
    entityId: input.bindingId,
    metadata: { telegram_user_id: updated.telegram_user_id },
  });

  revalidatePath(REVALIDATE);
  return { ok: true };
}
