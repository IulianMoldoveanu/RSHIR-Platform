'use server';

// Pairing notes — async coordination between OWNER and FLEET_MANAGER on
// the same tenant. Sister to fm-invite-actions.ts; both back the same
// /dashboard/settings/team page.
//
// Column-level write guard (matches the migration comment):
//   * note_from_owner    -> OWNER only (target = a FM tenant_members row)
//   * note_from_fleet    -> FLEET_MANAGER only (own row)
//   * fm_phone           -> FLEET_MANAGER only (own row)
//
// Reads happen in the page server component via the admin client and
// are scoped to the active tenant — RLS already restricts SELECT to
// fellow tenant members. We never expose another tenant's notes.

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';

// Local role lookup that returns the raw enum value, including
// FLEET_MANAGER. The shared getTenantRole helper coerces non-OWNER to
// 'STAFF' so we cannot use it for the FM-only branch below.
async function getRawTenantRole(
  userId: string,
  tenantId: string,
): Promise<'OWNER' | 'STAFF' | 'FLEET_MANAGER' | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tenant_members')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) return null;
  if (!data) return null;
  if (data.role === 'OWNER') return 'OWNER';
  if (data.role === 'FLEET_MANAGER') return 'FLEET_MANAGER';
  return 'STAFF';
}

const REVALIDATE = '/dashboard/settings/team';
const NOTE_MAX_CHARS = 2000;
const PHONE_MAX_CHARS = 32;
// Allow digits, plus, hyphen, whitespace, parentheses. Anything else is dropped.
const PHONE_ALLOWED_RE = /[^0-9+\-\s()]/g;

export type PairingNoteResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | 'unauthenticated'
        | 'forbidden'
        | 'invalid_input'
        | 'member_not_found'
        | 'db_error';
      detail?: string;
    };

function sanitizeNote(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, NOTE_MAX_CHARS);
}

function sanitizePhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const cleaned = raw.replace(PHONE_ALLOWED_RE, '').trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, PHONE_MAX_CHARS);
}

// ────────────────────────────────────────────────────────────
// OWNER writes note_from_owner on a specific FM's tenant_members row.
// ────────────────────────────────────────────────────────────

export async function setNoteFromOwner(input: {
  fmUserId: string;
  expectedTenantId: string;
  note: string | null;
}): Promise<PairingNoteResult> {
  let active;
  try {
    active = await getActiveTenant();
  } catch {
    return { ok: false, error: 'unauthenticated' };
  }
  const { user, tenant } = active;
  if (!input.expectedTenantId || tenant.id !== input.expectedTenantId) {
    return { ok: false, error: 'forbidden', detail: 'tenant_mismatch' };
  }
  if (!input.fmUserId) return { ok: false, error: 'invalid_input' };

  const role = await getRawTenantRole(user.id, tenant.id);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden' };

  const note = sanitizeNote(input.note);

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { data: row, error: lookupErr } = await sb
    .from('tenant_members')
    .select('user_id, role')
    .eq('tenant_id', tenant.id)
    .eq('user_id', input.fmUserId)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: 'db_error', detail: lookupErr.message };
  if (!row) return { ok: false, error: 'member_not_found' };
  if (row.role !== 'FLEET_MANAGER') {
    return { ok: false, error: 'invalid_input', detail: 'target_not_fleet_manager' };
  }

  const { error: updErr } = await sb
    .from('tenant_members')
    .update({
      note_from_owner: note,
      note_from_owner_updated_at: note === null ? null : new Date().toISOString(),
    })
    .eq('tenant_id', tenant.id)
    .eq('user_id', input.fmUserId);
  if (updErr) return { ok: false, error: 'db_error', detail: updErr.message };

  await logAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: 'pairing_note.owner_updated',
    entityType: 'tenant_member',
    entityId: input.fmUserId,
    metadata: { length: note?.length ?? 0, cleared: note === null },
  });

  revalidatePath(REVALIDATE);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// FLEET_MANAGER writes note_from_fleet on their OWN tenant_members row
// for the active tenant. fm_phone optionally updated alongside.
// ────────────────────────────────────────────────────────────

export async function setNoteFromFleet(input: {
  expectedTenantId: string;
  note: string | null;
  phone?: string | null;
}): Promise<PairingNoteResult> {
  let active;
  try {
    active = await getActiveTenant();
  } catch {
    return { ok: false, error: 'unauthenticated' };
  }
  const { user, tenant } = active;
  if (!input.expectedTenantId || tenant.id !== input.expectedTenantId) {
    return { ok: false, error: 'forbidden', detail: 'tenant_mismatch' };
  }

  const role = await getRawTenantRole(user.id, tenant.id);
  if (role !== 'FLEET_MANAGER') return { ok: false, error: 'forbidden' };

  const note = sanitizeNote(input.note);
  const phoneProvided = Object.prototype.hasOwnProperty.call(input, 'phone');
  const phone = phoneProvided ? sanitizePhone(input.phone) : undefined;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const update: Record<string, unknown> = {
    note_from_fleet: note,
    note_from_fleet_updated_at:
      note === null ? null : new Date().toISOString(),
  };
  if (phoneProvided) {
    update.fm_phone = phone ?? null;
  }

  const { error: updErr, data: updRows } = await sb
    .from('tenant_members')
    .update(update)
    .eq('tenant_id', tenant.id)
    .eq('user_id', user.id)
    .eq('role', 'FLEET_MANAGER')
    .select('user_id');
  if (updErr) return { ok: false, error: 'db_error', detail: updErr.message };
  if (!updRows || updRows.length === 0) {
    // Defence-in-depth: getTenantRole said FLEET_MANAGER but the row
    // disappeared between the check and the update (race / concurrent
    // OWNER revoked the membership).
    return { ok: false, error: 'member_not_found' };
  }

  await logAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: 'pairing_note.fleet_updated',
    entityType: 'tenant_member',
    entityId: user.id,
    metadata: { length: note?.length ?? 0, cleared: note === null },
  });

  if (phoneProvided) {
    await logAudit({
      tenantId: tenant.id,
      actorUserId: user.id,
      action: 'pairing_note.fm_phone_updated',
      entityType: 'tenant_member',
      entityId: user.id,
      metadata: { has_phone: phone !== null },
    });
  }

  revalidatePath(REVALIDATE);
  return { ok: true };
}

// Exported for unit tests so we can assert the input sanitization
// without spinning up Supabase.
export const __test__ = { sanitizeNote, sanitizePhone };
