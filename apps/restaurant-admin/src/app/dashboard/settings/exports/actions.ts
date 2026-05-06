'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { isValidVatRate, normalizeCui, readFiscal } from '@/lib/fiscal';
import { logAudit } from '@/lib/audit';

export type SaveFiscalResult =
  | { ok: true }
  | { ok: false; error: string; detail?: string };

export async function saveFiscalSettings(formData: FormData): Promise<SaveFiscalResult> {
  const legalName = String(formData.get('legal_name') ?? '').trim();
  const cuiInput = String(formData.get('cui') ?? '');
  const vatRateRaw = Number(formData.get('vat_rate_pct'));
  const expectedTenantId = String(formData.get('tenantId') ?? '');

  if (legalName.length > 200) {
    return { ok: false, error: 'invalid_input', detail: 'legal_name' };
  }
  const cui = normalizeCui(cuiInput);
  if (cui === null) {
    return { ok: false, error: 'invalid_input', detail: 'cui' };
  }
  if (!isValidVatRate(vatRateRaw)) {
    return { ok: false, error: 'invalid_input', detail: 'vat_rate_pct' };
  }
  if (!expectedTenantId) {
    return { ok: false, error: 'invalid_input', detail: 'tenantId' };
  }

  const { user, tenant } = await getActiveTenant().catch(() => ({ user: null, tenant: null }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (tenant.id !== expectedTenantId) return { ok: false, error: 'tenant_mismatch' };

  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  const admin = createAdminClient();

  // Read current settings, merge fiscal subkey, write back. Avoid clobbering
  // unrelated settings keys other features write to (cuisine_types, etc.).
  const { data: tenantRow, error: readErr } = await admin
    .from('tenants')
    .select('settings, name')
    .eq('id', expectedTenantId)
    .single();
  if (readErr || !tenantRow) {
    return { ok: false, error: 'db_error', detail: readErr?.message ?? 'tenant_not_found' };
  }

  const currentSettings =
    tenantRow.settings && typeof tenantRow.settings === 'object'
      ? (tenantRow.settings as Record<string, unknown>)
      : {};
  const nextSettings = {
    ...currentSettings,
    fiscal: {
      legal_name: legalName,
      cui,
      vat_rate_pct: vatRateRaw,
    },
  };

  const { error: writeErr } = await admin
    .from('tenants')
    .update({ settings: nextSettings })
    .eq('id', expectedTenantId);
  if (writeErr) {
    return { ok: false, error: 'db_error', detail: writeErr.message };
  }

  // Sanity: round-trip through readFiscal so future regressions in shape
  // surface as test failures, not silent corruption.
  const _check = readFiscal(nextSettings, tenantRow.name ?? '');
  void _check;

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: user.id,
    action: 'fiscal.settings_updated',
    entityType: 'tenant',
    entityId: expectedTenantId,
    metadata: { vat_rate_pct: vatRateRaw, has_cui: cui.length > 0 },
  });

  revalidatePath('/dashboard/settings/exports');
  return { ok: true };
}
