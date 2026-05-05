'use server';

// Platform-admin server actions for Fleet Manager multi-tenant Option A.
// Gated by HIR_PLATFORM_ADMIN_EMAILS env var (same pattern as
// /dashboard/admin/partners). Internal naming uses "external dispatch" /
// "fleet manager"; merchant-facing surfaces never see these terms.
//
// All writes use the service-role admin client (bypasses RLS). No client
// component may import this file directly — Next 14 server actions only.

import { revalidatePath } from 'next/cache';
import { randomBytes } from 'node:crypto';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';

const REVALIDATE = '/dashboard/admin/fleet-managers';

// ────────────────────────────────────────────────────────────
// Platform-admin gate
// ────────────────────────────────────────────────────────────

async function requirePlatformAdmin(): Promise<
  { userId: string; email: string } | { error: string }
> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'Neautentificat.' };

  const allowList = (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!allowList.includes(user.email.toLowerCase())) {
    return { error: 'Acces interzis: nu sunteți administrator de platformă.' };
  }

  return { userId: user.id, email: user.email };
}

export type FleetManagerActionResult =
  | { ok: true }
  | { ok: false; error: string };

// ────────────────────────────────────────────────────────────
// Validation helpers
// ────────────────────────────────────────────────────────────

function validateWebhookUrl(s: string): { ok: true } | { ok: false; error: string } {
  if (s.length === 0) return { ok: false, error: 'URL-ul este obligatoriu.' };
  if (s.length > 500) return { ok: false, error: 'URL-ul depășește 500 de caractere.' };
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, error: 'URL-ul nu este valid.' };
  }
  if (u.protocol !== 'https:') {
    return { ok: false, error: 'URL-ul trebuie să fie https://.' };
  }
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// addFleetManagerMembership
//   Inserts a tenant_members row with role=FLEET_MANAGER for an
//   existing auth.users record. Looked up by email.
// ────────────────────────────────────────────────────────────

export async function addFleetManagerMembership(input: {
  email: string;
  tenant_id: string;
}): Promise<FleetManagerActionResult> {
  const guard = await requirePlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };

  const email = input.email.trim().toLowerCase();
  if (!email || !/.+@.+\..+/.test(email)) {
    return { ok: false, error: 'Email invalid.' };
  }
  if (!input.tenant_id) {
    return { ok: false, error: 'Tenant lipsă.' };
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  // Resolve auth user by email via Supabase Admin API. Auth schema is not
  // exposed via PostgREST; we use the Auth admin client.
  const { data: authData, error: authErr } = await sb.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (authErr) return { ok: false, error: authErr.message };
  const target = (authData?.users ?? []).find(
    (u: { email?: string | null }) => (u.email ?? '').toLowerCase() === email,
  );
  if (!target) {
    return {
      ok: false,
      error: `Nu există un utilizator cu emailul ${email}. Trimiteți-i mai întâi un invite din Supabase.`,
    };
  }

  // Idempotent insert. If the user is already an OWNER/STAFF on this
  // tenant we keep the existing row — we don't downgrade them. Insert
  // only when no membership row exists.
  const { data: existing, error: readErr } = await sb
    .from('tenant_members')
    .select('user_id, role')
    .eq('tenant_id', input.tenant_id)
    .eq('user_id', target.id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };

  if (existing) {
    if (existing.role === 'FLEET_MANAGER') {
      return { ok: true }; // already done — no-op
    }
    return {
      ok: false,
      error: `Utilizatorul ${email} are deja rolul ${existing.role} pe acest restaurant. Eliminați întâi rolul existent.`,
    };
  }

  const { error } = await sb.from('tenant_members').insert({
    tenant_id: input.tenant_id,
    user_id: target.id,
    role: 'FLEET_MANAGER',
  });
  if (error) return { ok: false, error: error.message };

  await logAudit({
    tenantId: input.tenant_id,
    actorUserId: guard.userId,
    action: 'fleet_manager.membership_added',
    entityType: 'tenant_member',
    entityId: target.id,
    metadata: { email, role: 'FLEET_MANAGER' },
  });

  revalidatePath(REVALIDATE);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// removeFleetManagerMembership
// ────────────────────────────────────────────────────────────

export async function removeFleetManagerMembership(input: {
  user_id: string;
  tenant_id: string;
}): Promise<FleetManagerActionResult> {
  const guard = await requirePlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };

  if (!input.user_id || !input.tenant_id) {
    return { ok: false, error: 'Parametri lipsă.' };
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  // Only delete rows where role=FLEET_MANAGER — never accidentally remove
  // an OWNER membership through this UI.
  const { error } = await sb
    .from('tenant_members')
    .delete()
    .eq('tenant_id', input.tenant_id)
    .eq('user_id', input.user_id)
    .eq('role', 'FLEET_MANAGER');
  if (error) return { ok: false, error: error.message };

  await logAudit({
    tenantId: input.tenant_id,
    actorUserId: guard.userId,
    action: 'fleet_manager.membership_removed',
    entityType: 'tenant_member',
    entityId: input.user_id,
    metadata: { role: 'FLEET_MANAGER' },
  });

  revalidatePath(REVALIDATE);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// setExternalDispatchConfig
//   Updates webhook URL + (optionally) rotates secret + toggles enabled.
//   The secret is generated server-side; never accept it from the client.
// ────────────────────────────────────────────────────────────

export async function setExternalDispatchConfig(input: {
  tenant_id: string;
  webhook_url: string | null; // null = clear
  rotate_secret: boolean;
  enabled: boolean;
}): Promise<{ ok: true; new_secret_preview?: string } | { ok: false; error: string }> {
  const guard = await requirePlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };

  if (!input.tenant_id) return { ok: false, error: 'Tenant lipsă.' };

  // Validate URL only when not clearing.
  if (input.webhook_url !== null) {
    const v = validateWebhookUrl(input.webhook_url);
    if (!v.ok) return { ok: false, error: v.error };
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { data: current, error: readErr } = await sb
    .from('tenants')
    .select('external_dispatch_webhook_url, external_dispatch_secret, external_dispatch_enabled')
    .eq('id', input.tenant_id)
    .single();
  if (readErr) return { ok: false, error: readErr.message };

  let nextSecret: string | null =
    (current?.external_dispatch_secret as string | null) ?? null;
  let secretPreview: string | undefined;
  let secretRotated = false;

  if (input.rotate_secret || (input.webhook_url !== null && nextSecret === null)) {
    // 32 random bytes -> 64 hex chars. Treated as opaque shared secret.
    const fresh = randomBytes(32).toString('hex');
    nextSecret = fresh;
    // Show only 6+4 chars to operator post-write so they can copy it once.
    secretPreview = `${fresh.slice(0, 6)}…${fresh.slice(-4)}`;
    secretRotated = true;
  }

  if (input.webhook_url === null) {
    // Clearing: also wipe secret + force enabled=false for the CHECK constraint.
    nextSecret = null;
  }

  const finalEnabled = input.webhook_url === null ? false : input.enabled;

  const { error } = await sb
    .from('tenants')
    .update({
      external_dispatch_webhook_url: input.webhook_url,
      external_dispatch_secret: nextSecret,
      external_dispatch_enabled: finalEnabled,
    })
    .eq('id', input.tenant_id);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    tenantId: input.tenant_id,
    actorUserId: guard.userId,
    action: 'tenant.external_dispatch_configured',
    entityType: 'tenant',
    entityId: input.tenant_id,
    metadata: {
      webhook_url: input.webhook_url,
      enabled: finalEnabled,
      secret_rotated: secretRotated,
    },
  });

  revalidatePath(REVALIDATE);
  return secretPreview ? { ok: true, new_secret_preview: secretPreview } : { ok: true };
}
