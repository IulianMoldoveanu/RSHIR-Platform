'use server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';

// RSHIR-33: tenant-scoped CRUD for promo codes. Follows the RSHIR-26 M-3
// expectedTenantId pattern — caller passes the tenantId rendered server-side
// so a multi-tenant cookie race cannot retarget the write.

export type PromoKind = 'PERCENT' | 'FIXED' | 'FREE_DELIVERY';

export type PromoInput = {
  code: string;
  kind: PromoKind;
  valueInt: number;
  minOrderRon: number;
  maxUses: number | null;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
};

export type PromoActionResult =
  | { ok: true; id?: string }
  | {
      ok: false;
      error:
        | 'unauthenticated'
        | 'tenant_mismatch'
        | 'forbidden_owner_only'
        | 'invalid_input'
        | 'duplicate_code'
        | 'db_error';
      detail?: string;
    };

const CODE_RE = /^[A-Z0-9_-]{2,32}$/;

function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const upper = raw.trim().toUpperCase();
  return CODE_RE.test(upper) ? upper : null;
}

function validate(input: PromoInput): string | null {
  if (!normalizeCode(input.code)) return 'invalid_code';
  if (input.kind !== 'PERCENT' && input.kind !== 'FIXED' && input.kind !== 'FREE_DELIVERY') {
    return 'invalid_kind';
  }
  if (!Number.isFinite(input.valueInt) || !Number.isInteger(input.valueInt)) {
    return 'invalid_value';
  }
  if (input.kind === 'PERCENT' && (input.valueInt < 1 || input.valueInt > 100)) {
    return 'percent_out_of_range';
  }
  if (input.kind === 'FIXED' && input.valueInt < 1) {
    return 'fixed_must_be_positive';
  }
  if (!Number.isFinite(input.minOrderRon) || input.minOrderRon < 0) {
    return 'invalid_min_order';
  }
  if (input.maxUses !== null && (!Number.isInteger(input.maxUses) || input.maxUses < 1)) {
    return 'invalid_max_uses';
  }
  if (input.validFrom && Number.isNaN(Date.parse(input.validFrom))) return 'invalid_valid_from';
  if (input.validUntil && Number.isNaN(Date.parse(input.validUntil))) return 'invalid_valid_until';
  if (
    input.validFrom &&
    input.validUntil &&
    Date.parse(input.validFrom) >= Date.parse(input.validUntil)
  ) {
    return 'invalid_window';
  }
  return null;
}

async function assertOwner(expectedTenantId: string): Promise<PromoActionResult | { ok: true; tenantId: string }> {
  const { user, tenant } = await getActiveTenant().catch(() => ({ user: null, tenant: null }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (!expectedTenantId || tenant.id !== expectedTenantId) {
    return { ok: false, error: 'tenant_mismatch' };
  }
  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };
  return { ok: true, tenantId: expectedTenantId };
}

export async function createPromoAction(
  input: PromoInput,
  expectedTenantId: string,
): Promise<PromoActionResult> {
  const guard = await assertOwner(expectedTenantId);
  if (!('tenantId' in guard)) return guard;

  const code = normalizeCode(input.code);
  if (!code) return { ok: false, error: 'invalid_input', detail: 'invalid_code' };
  const verr = validate({ ...input, code });
  if (verr) return { ok: false, error: 'invalid_input', detail: verr };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('promo_codes')
    .insert({
      tenant_id: guard.tenantId,
      code,
      kind: input.kind,
      value_int: input.kind === 'FREE_DELIVERY' ? 0 : input.valueInt,
      min_order_ron: input.minOrderRon,
      max_uses: input.maxUses,
      valid_from: input.validFrom,
      valid_until: input.validUntil,
      is_active: input.isActive,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'duplicate_code' };
    return { ok: false, error: 'db_error', detail: error.message };
  }
  revalidatePath('/dashboard/promos');
  return { ok: true, id: data.id };
}

export async function updatePromoAction(
  id: string,
  input: PromoInput,
  expectedTenantId: string,
): Promise<PromoActionResult> {
  const guard = await assertOwner(expectedTenantId);
  if (!('tenantId' in guard)) return guard;

  const code = normalizeCode(input.code);
  if (!code) return { ok: false, error: 'invalid_input', detail: 'invalid_code' };
  const verr = validate({ ...input, code });
  if (verr) return { ok: false, error: 'invalid_input', detail: verr };

  const admin = createAdminClient();
  const { error } = await admin
    .from('promo_codes')
    .update({
      code,
      kind: input.kind,
      value_int: input.kind === 'FREE_DELIVERY' ? 0 : input.valueInt,
      min_order_ron: input.minOrderRon,
      max_uses: input.maxUses,
      valid_from: input.validFrom,
      valid_until: input.validUntil,
      is_active: input.isActive,
    })
    .eq('id', id)
    .eq('tenant_id', guard.tenantId);
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'duplicate_code' };
    return { ok: false, error: 'db_error', detail: error.message };
  }
  revalidatePath('/dashboard/promos');
  return { ok: true };
}

export async function togglePromoAction(
  id: string,
  isActive: boolean,
  expectedTenantId: string,
): Promise<PromoActionResult> {
  const guard = await assertOwner(expectedTenantId);
  if (!('tenantId' in guard)) return guard;

  const admin = createAdminClient();
  const { error } = await admin
    .from('promo_codes')
    .update({ is_active: isActive })
    .eq('id', id)
    .eq('tenant_id', guard.tenantId);
  if (error) return { ok: false, error: 'db_error', detail: error.message };
  revalidatePath('/dashboard/promos');
  return { ok: true };
}

export async function deletePromoAction(
  id: string,
  expectedTenantId: string,
): Promise<PromoActionResult> {
  const guard = await assertOwner(expectedTenantId);
  if (!('tenantId' in guard)) return guard;

  const admin = createAdminClient();
  const { error } = await admin
    .from('promo_codes')
    .delete()
    .eq('id', id)
    .eq('tenant_id', guard.tenantId);
  if (error) return { ok: false, error: 'db_error', detail: error.message };
  revalidatePath('/dashboard/promos');
  return { ok: true };
}
