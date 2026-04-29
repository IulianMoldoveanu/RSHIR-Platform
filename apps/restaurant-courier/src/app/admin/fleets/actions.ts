'use server';

import { randomBytes, createHash } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkPlatformAdmin } from '@/lib/platform-admin';
import { logAudit } from '@/lib/audit';

const REVALIDATE = '/admin/fleets';

export type ActionResult =
  | { ok: true; data?: Record<string, unknown> }
  | { ok: false; error: string };

export type CreateApiKeyResult =
  | { ok: true; rawKey: string; keyId: string }
  | { ok: false; error: string };

// ── Helpers ─────────────────────────────────────────────────────────────────

function toKebab(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Supabase client typed loosely because courier_fleets isn't in generated types yet.
type AdminSb = {
  from: (t: string) => {
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => {
        single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
  };
  auth: {
    admin: {
      inviteUserByEmail: (email: string) => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      createUser: (opts: Record<string, unknown>) => Promise<{ data: { user: { id: string } | null } | null; error: { message: string } | null }>;
    };
  };
};

function adminSb(): AdminSb {
  return createAdminClient() as unknown as AdminSb;
}

// ── createFleet ──────────────────────────────────────────────────────────────

export async function createFleet(formData: FormData): Promise<ActionResult & { fleetId?: string }> {
  const guard = await checkPlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };

  const name = (formData.get('name') as string | null)?.trim();
  const slugRaw = (formData.get('slug') as string | null)?.trim();
  const brandColor = (formData.get('brand_color') as string | null) ?? '#8b5cf6';
  const tier = (formData.get('tier') as string | null) ?? 'partner';
  const allowedVerticals = formData.getAll('allowed_verticals') as string[];
  const ownerEmail = (formData.get('owner_email') as string | null)?.trim();

  if (!name) return { ok: false, error: 'Numele flotei este obligatoriu.' };
  if (!['owner', 'partner', 'external'].includes(tier)) {
    return { ok: false, error: 'Tier invalid.' };
  }
  if (allowedVerticals.length === 0) {
    return { ok: false, error: 'Selectați cel puțin un vertical.' };
  }

  const slug = slugRaw || toKebab(name);
  if (!slug) return { ok: false, error: 'Slug invalid.' };

  let ownerUserId: string | null = null;
  if (ownerEmail) {
    const sb = adminSb();
    // Try to find existing user first.
    const { data: existingUser } = await (createAdminClient() as unknown as {
      from: (t: string) => never;
      auth: { admin: { listUsers: () => Promise<{ data: { users: Array<{ id: string; email: string }> } | null }> } };
    }).auth.admin.listUsers();
    const found = existingUser?.users.find((u) => u.email === ownerEmail);
    if (found) {
      ownerUserId = found.id;
    } else {
      const { data: invited, error: inviteErr } = await sb.auth.admin.inviteUserByEmail(ownerEmail);
      if (inviteErr) return { ok: false, error: `Invite failed: ${inviteErr.message}` };
      ownerUserId = (invited as unknown as { user?: { id: string } } | null)?.user?.id ?? null;
    }
  }

  const sb = adminSb();
  const { data, error } = await sb
    .from('courier_fleets')
    .insert({
      slug,
      name,
      brand_color: brandColor,
      tier,
      allowed_verticals: allowedVerticals,
      owner_user_id: ownerUserId,
      is_active: true,
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };

  const fleetId = String(data.id);

  await logAudit({
    actorUserId: guard.userId,
    action: 'fleet.created',
    entityType: 'courier_fleet',
    entityId: fleetId,
    metadata: { slug, name, tier, allowed_verticals: allowedVerticals },
  });

  revalidatePath(REVALIDATE);
  return { ok: true, fleetId };
}

// ── updateFleet ──────────────────────────────────────────────────────────────

export async function updateFleet(
  fleetId: string,
  formData: FormData,
): Promise<ActionResult> {
  const guard = await checkPlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };

  const name = (formData.get('name') as string | null)?.trim();
  const brandColor = formData.get('brand_color') as string | null;
  const tier = formData.get('tier') as string | null;
  const allowedVerticals = formData.getAll('allowed_verticals') as string[];
  const isActiveRaw = formData.get('is_active');
  const isActive = isActiveRaw !== null ? isActiveRaw === 'true' : undefined;

  if (allowedVerticals.length === 0) {
    return { ok: false, error: 'Selectați cel puțin un vertical.' };
  }
  if (tier && !['owner', 'partner', 'external'].includes(tier)) {
    return { ok: false, error: 'Tier invalid.' };
  }

  const updates: Record<string, unknown> = {};
  if (name) updates.name = name;
  if (brandColor) updates.brand_color = brandColor;
  if (tier) updates.tier = tier;
  if (allowedVerticals.length > 0) updates.allowed_verticals = allowedVerticals;
  if (isActive !== undefined) updates.is_active = isActive;

  const sb = adminSb();
  const { error } = await sb.from('courier_fleets').update(updates).eq('id', fleetId);
  if (error) return { ok: false, error: error.message };

  const action = isActive === false ? 'fleet.deactivated' : isActive === true ? 'fleet.activated' : 'fleet.updated';
  await logAudit({
    actorUserId: guard.userId,
    action,
    entityType: 'courier_fleet',
    entityId: fleetId,
    metadata: updates,
  });

  revalidatePath(`${REVALIDATE}/${fleetId}`);
  revalidatePath(REVALIDATE);
  return { ok: true };
}

// ── inviteCourier ────────────────────────────────────────────────────────────

export async function inviteCourier(
  fleetId: string,
  email: string,
  fullName: string,
): Promise<ActionResult> {
  const guard = await checkPlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };

  if (!email.trim()) return { ok: false, error: 'Email-ul este obligatoriu.' };
  if (!fullName.trim()) return { ok: false, error: 'Numele este obligatoriu.' };

  const sb = adminSb();
  // Invite or create the user.
  const { data: invited, error: inviteErr } = await sb.auth.admin.inviteUserByEmail(email.trim());
  if (inviteErr) return { ok: false, error: `Invite failed: ${inviteErr.message}` };

  const userId = (invited as unknown as { user?: { id: string } } | null)?.user?.id;
  if (!userId) return { ok: false, error: 'Could not resolve user id after invite.' };

  // Insert courier_profiles row (upsert so re-inviting is safe).
  const admin = createAdminClient();
  const { error: profileErr } = await (admin as unknown as {
    from: (t: string) => {
      upsert: (row: Record<string, unknown>, opts: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  })
    .from('courier_profiles')
    .upsert(
      {
        user_id: userId,
        fleet_id: fleetId,
        full_name: fullName.trim(),
        phone: '',
        vehicle_type: 'BIKE',
        status: 'INACTIVE',
      },
      { onConflict: 'user_id' },
    );

  if (profileErr) return { ok: false, error: profileErr.message };

  await logAudit({
    actorUserId: guard.userId,
    action: 'fleet.courier_invited',
    entityType: 'courier_fleet',
    entityId: fleetId,
    metadata: { email, full_name: fullName },
  });

  revalidatePath(`${REVALIDATE}/${fleetId}`);
  return { ok: true };
}

// ── createFleetApiKey ────────────────────────────────────────────────────────

export async function createFleetApiKey(
  fleetId: string,
  label: string,
  scopes: string[],
): Promise<CreateApiKeyResult> {
  const guard = await checkPlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };

  if (!label.trim()) return { ok: false, error: 'Eticheta este obligatorie.' };
  if (scopes.length === 0) return { ok: false, error: 'Selectați cel puțin un scope.' };

  const raw = `hir_fleet_${randomBytes(32).toString('base64url')}`;
  const hash = createHash('sha256').update(raw).digest('hex');
  const keyPrefix = raw.slice(0, 12);

  const admin = createAdminClient();
  const { data, error } = await (admin as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => {
          single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
      };
    };
  })
    .from('courier_api_keys')
    .insert({
      fleet_id: fleetId,
      owner_user_id: guard.userId,
      label: label.trim(),
      scopes,
      key_hash: hash,
      key_prefix: keyPrefix,
      is_active: true,
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };

  const keyId = String(data.id);

  await logAudit({
    actorUserId: guard.userId,
    action: 'fleet.api_key_created',
    entityType: 'courier_api_key',
    entityId: keyId,
    metadata: { fleet_id: fleetId, label, scopes },
  });

  revalidatePath(`${REVALIDATE}/${fleetId}`);
  return { ok: true, rawKey: raw, keyId };
}

// ── revokeFleetApiKey ────────────────────────────────────────────────────────

export async function revokeFleetApiKey(keyId: string): Promise<ActionResult> {
  const guard = await checkPlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const { error } = await (admin as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  })
    .from('courier_api_keys')
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq('id', keyId);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    actorUserId: guard.userId,
    action: 'fleet.api_key_revoked',
    entityType: 'courier_api_key',
    entityId: keyId,
  });

  revalidatePath(REVALIDATE);
  return { ok: true };
}
