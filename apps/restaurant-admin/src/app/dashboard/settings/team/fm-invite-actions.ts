'use server';

// Fleet Manager self-invite: OWNER-issued share-link tokens.
//
// Flow (Option B-i, no email provider involved):
// 1. OWNER calls inviteFleetManager(email) -> we generate a 32-byte token,
//    hash it, store the hash + 7d TTL, return the raw token + share URL.
// 2. OWNER hands the URL to the FM out of band (WhatsApp / Telegram /
//    mailto). Raw token never persists server-side and is never returned
//    again — re-inviting requires creating a fresh token.
// 3. FM clicks the URL while signed in with the same email; the accept
//    page calls acceptFleetManagerInvite(token) which inserts the
//    tenant_members row and marks the invite consumed. Idempotent.
//
// Internal-only — these surfaces never reach merchants. "Fleet Manager"
// terminology is fine here because the audience is platform admins + the
// FM's own admin login.

import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { createServerClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit';

const REVALIDATE = '/dashboard/settings/team';
const INVITE_TTL_DAYS = 7;
const INVITE_RATE_LIMIT_24H = 10;

export type FmInviteCreateResult =
  | { ok: true; token: string; url: string }
  | {
      ok: false;
      error:
        | 'unauthenticated'
        | 'forbidden_owner_only'
        | 'invalid_email'
        | 'rate_limited'
        | 'duplicate_pending'
        | 'db_error';
      detail?: string;
    };

export type FmInviteMutationResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | 'unauthenticated'
        | 'forbidden_owner_only'
        | 'invalid_input'
        | 'invite_not_found'
        | 'already_consumed'
        | 'db_error';
      detail?: string;
    };

export type FmInviteAcceptResult =
  | { ok: true; tenant_id: string }
  | {
      ok: false;
      error:
        | 'unauthenticated'
        | 'invalid_token'
        | 'expired'
        | 'email_mismatch'
        | 'db_error';
      detail?: string;
    };

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function isPlausibleEmail(s: string): boolean {
  // Mirror the validation used in fleet-managers/actions.ts.
  return /.+@.+\..+/.test(s);
}

function buildAdminUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_ADMIN_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const fromApp = process.env.NEXT_PUBLIC_APP_URL;
  if (fromApp) return fromApp.replace(/\/$/, '');
  const primary = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN ?? 'hiraisolutions.ro';
  return `https://app.${primary}`;
}

// ────────────────────────────────────────────────────────────
// inviteFleetManager — OWNER creates a token; we return raw + URL ONCE.
// ────────────────────────────────────────────────────────────

export async function inviteFleetManager(input: {
  email: string;
  expectedTenantId: string;
}): Promise<FmInviteCreateResult> {
  let active;
  try {
    active = await getActiveTenant();
  } catch {
    return { ok: false, error: 'unauthenticated' };
  }
  const { user, tenant } = active;
  if (!input.expectedTenantId || tenant.id !== input.expectedTenantId) {
    return { ok: false, error: 'forbidden_owner_only', detail: 'tenant_mismatch' };
  }
  const role = await getTenantRole(user.id, tenant.id).catch(() => null);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  const email = input.email.trim().toLowerCase();
  if (!email || !isPlausibleEmail(email) || email.length > 320) {
    return { ok: false, error: 'invalid_email' };
  }

  const admin = createAdminClient();
  // fm_invites lands via migration 20260506_004 and is not yet in the
  // generated supabase types — cast through unknown so tsc accepts it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  // Rate limit: ≥10 invites for this tenant in the last 24h -> reject.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recentCount, error: rlErr } = await sb
    .from('fm_invites')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
    .gte('created_at', since);
  if (rlErr) {
    console.error('[fm-invite] rate-limit check failed', rlErr.message);
    return { ok: false, error: 'db_error' };
  }
  if ((recentCount ?? 0) >= INVITE_RATE_LIMIT_24H) {
    return { ok: false, error: 'rate_limited' };
  }

  // Reject if there's already a pending (non-accepted, non-revoked)
  // invite for this (tenant,email). The unique partial index on the
  // table would also reject the insert, but a friendlier error first.
  const { data: existingPending, error: dupErr } = await sb
    .from('fm_invites')
    .select('id')
    .eq('tenant_id', tenant.id)
    .ilike('email', email)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .maybeSingle();
  if (dupErr) {
    console.error('[fm-invite] dup-check failed', dupErr.message);
    return { ok: false, error: 'db_error' };
  }
  if (existingPending) {
    return { ok: false, error: 'duplicate_pending' };
  }

  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const expires = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: inserted, error: insErr } = await sb
    .from('fm_invites')
    .insert({
      tenant_id: tenant.id,
      email,
      invited_by: user.id,
      token_hash: tokenHash,
      expires_at: expires,
    })
    .select('id')
    .single();
  if (insErr) {
    console.error('[fm-invite] insert failed', insErr.message);
    return { ok: false, error: 'db_error', detail: insErr.message };
  }

  await logAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: 'fleet_manager.invite_created',
    entityType: 'fm_invite',
    entityId: inserted.id as string,
    metadata: { email, expires_at: expires },
  });

  const url = `${buildAdminUrl()}/invite/fm/${rawToken}`;

  revalidatePath(REVALIDATE);
  return { ok: true, token: rawToken, url };
}

// ────────────────────────────────────────────────────────────
// revokeFleetManagerInvite — OWNER revokes a still-pending invite.
// ────────────────────────────────────────────────────────────

export async function revokeFleetManagerInvite(input: {
  inviteId: string;
  expectedTenantId: string;
}): Promise<FmInviteMutationResult> {
  let active;
  try {
    active = await getActiveTenant();
  } catch {
    return { ok: false, error: 'unauthenticated' };
  }
  const { user, tenant } = active;
  if (!input.expectedTenantId || tenant.id !== input.expectedTenantId) {
    return { ok: false, error: 'invalid_input', detail: 'tenant_mismatch' };
  }
  const role = await getTenantRole(user.id, tenant.id).catch(() => null);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  if (!input.inviteId) return { ok: false, error: 'invalid_input' };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { data: row, error: lookupErr } = await sb
    .from('fm_invites')
    .select('id, tenant_id, accepted_at, revoked_at, email')
    .eq('id', input.inviteId)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: 'db_error', detail: lookupErr.message };
  if (!row) return { ok: false, error: 'invite_not_found' };
  if (row.tenant_id !== tenant.id) {
    return { ok: false, error: 'invite_not_found' };
  }
  if (row.accepted_at || row.revoked_at) {
    return { ok: false, error: 'already_consumed' };
  }

  const { error: updErr } = await sb
    .from('fm_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', input.inviteId);
  if (updErr) return { ok: false, error: 'db_error', detail: updErr.message };

  await logAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: 'fleet_manager.invite_revoked',
    entityType: 'fm_invite',
    entityId: input.inviteId,
    metadata: { email: row.email },
  });

  revalidatePath(REVALIDATE);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// acceptFleetManagerInvite — invitee redeems their token.
// Idempotent: a second call after success returns ok with the
// same tenant_id.
// ────────────────────────────────────────────────────────────

export async function acceptFleetManagerInvite(
  rawToken: string,
): Promise<FmInviteAcceptResult> {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.length < 16) {
    return { ok: false, error: 'invalid_token' };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { ok: false, error: 'unauthenticated' };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const tokenHash = hashToken(rawToken);

  const { data: invite, error: lookupErr } = await sb
    .from('fm_invites')
    .select('id, tenant_id, email, expires_at, accepted_at, accepted_by, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: 'db_error', detail: lookupErr.message };
  if (!invite) return { ok: false, error: 'invalid_token' };

  if (invite.revoked_at) return { ok: false, error: 'invalid_token' };

  // Idempotent re-accept: same user, same invite -> success.
  if (invite.accepted_at) {
    if (invite.accepted_by === user.id) {
      return { ok: true, tenant_id: invite.tenant_id as string };
    }
    return { ok: false, error: 'invalid_token' };
  }

  const expiresAt = new Date(invite.expires_at as string).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return { ok: false, error: 'expired' };
  }

  if ((invite.email as string).toLowerCase() !== user.email.toLowerCase()) {
    return { ok: false, error: 'email_mismatch' };
  }

  // Insert tenant_members row idempotently. If user is already a member
  // (any role), keep the existing row and just mark the invite accepted.
  const { data: existingMember, error: memberLookupErr } = await sb
    .from('tenant_members')
    .select('user_id, role')
    .eq('tenant_id', invite.tenant_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (memberLookupErr) {
    return { ok: false, error: 'db_error', detail: memberLookupErr.message };
  }

  if (!existingMember) {
    const { error: insErr } = await sb.from('tenant_members').insert({
      tenant_id: invite.tenant_id,
      user_id: user.id,
      role: 'FLEET_MANAGER',
    });
    if (insErr) {
      return { ok: false, error: 'db_error', detail: insErr.message };
    }
  }

  const { error: markErr } = await sb
    .from('fm_invites')
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by: user.id,
    })
    .eq('id', invite.id);
  if (markErr) {
    // Membership row already inserted; surface the failure but log it.
    console.error('[fm-invite] mark-accepted failed', markErr.message);
    return { ok: false, error: 'db_error', detail: markErr.message };
  }

  await logAudit({
    tenantId: invite.tenant_id as string,
    actorUserId: user.id,
    action: 'fleet_manager.invite_accepted',
    entityType: 'fm_invite',
    entityId: invite.id as string,
    metadata: { email: invite.email },
  });

  return { ok: true, tenant_id: invite.tenant_id as string };
}

// ────────────────────────────────────────────────────────────
// Read helpers used by the page (server components only).
// ────────────────────────────────────────────────────────────

export type PendingFmInvite = {
  id: string;
  email: string;
  expires_at: string;
  created_at: string;
};

export type FmMember = {
  user_id: string;
  email: string | null;
};

export async function listPendingFmInvites(tenantId: string): Promise<PendingFmInvite[]> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data, error } = await sb
    .from('fm_invites')
    .select('id, email, expires_at, created_at')
    .eq('tenant_id', tenantId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[fm-invite] list pending failed', error.message);
    return [];
  }
  return (data ?? []) as PendingFmInvite[];
}

export async function listFmMembers(tenantId: string): Promise<FmMember[]> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data, error } = await sb
    .from('tenant_members')
    .select('user_id, role')
    .eq('tenant_id', tenantId)
    .eq('role', 'FLEET_MANAGER');
  if (error) {
    console.error('[fm-invite] list FMs failed', error.message);
    return [];
  }
  const rows = (data ?? []) as { user_id: string }[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.user_id);
  const emailById = new Map<string, string | null>();
  try {
    const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    for (const u of usersData.users) {
      if (ids.includes(u.id)) emailById.set(u.id, u.email ?? null);
    }
  } catch (e) {
    console.error('[fm-invite] auth listUsers failed', e);
  }

  return rows.map((r) => ({
    user_id: r.user_id,
    email: emailById.get(r.user_id) ?? null,
  }));
}
