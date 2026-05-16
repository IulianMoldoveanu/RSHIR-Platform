'use server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';

export type SubmitResult =
  | { ok: true; status: 'PENDING' }
  | { ok: false; error: string; detail?: string };

export type PaymentMode = 'cod_only' | 'card_test' | 'card_live';
const VALID_MODES: PaymentMode[] = ['cod_only', 'card_test', 'card_live'];

export type SetPaymentModeResult =
  | { ok: true; mode: PaymentMode }
  | { ok: false; error: string; detail?: string };

// OWNER-gated. Writes settings.payments.mode on the active tenant. The
// effective storefront/checkout-intent behavior is gated by the
// PSP_TENANT_TOGGLE_ENABLED env flag (resolvePaymentSurface in
// apps/restaurant-web/src/lib/payment-mode.ts) — when OFF, this column is
// stored but ignored.
export async function setPaymentMode(formData: FormData): Promise<SetPaymentModeResult> {
  const modeRaw = String(formData.get('mode') ?? '');
  const expectedTenantId = String(formData.get('tenantId') ?? '');
  if (!VALID_MODES.includes(modeRaw as PaymentMode)) {
    return { ok: false, error: 'invalid_input', detail: 'mode' };
  }
  const mode = modeRaw as PaymentMode;
  if (!expectedTenantId) {
    return { ok: false, error: 'invalid_input', detail: 'tenantId' };
  }

  const { user, tenant } = await getActiveTenant().catch(() => ({
    user: null,
    tenant: null,
  }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (tenant.id !== expectedTenantId) {
    return { ok: false, error: 'tenant_mismatch' };
  }
  // Platform admins (HIR_PLATFORM_ADMIN_EMAILS allow-list) may flip the mode
  // during onboarding even though they aren't tenant_members. Otherwise the
  // standard OWNER gate applies.
  const platformAdmin = isPlatformAdminEmail(user.email);
  if (!platformAdmin) {
    const role = await getTenantRole(user.id, expectedTenantId);
    if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };
  }

  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', expectedTenantId)
    .single();
  if (readErr || !existing) {
    return { ok: false, error: 'db_error', detail: readErr?.message };
  }

  const settings = (existing.settings as Record<string, unknown> | null) ?? {};
  const payments =
    (settings.payments as Record<string, unknown> | undefined) ?? {};
  const nextSettings = {
    ...settings,
    payments: { ...payments, mode },
  };

  const { error: writeErr } = await admin
    .from('tenants')
    .update({ settings: nextSettings as never })
    .eq('id', expectedTenantId);
  if (writeErr) return { ok: false, error: 'db_error', detail: writeErr.message };

  revalidatePath('/dashboard/settings/payments');
  return { ok: true, mode };
}

const VAT_RE = /^(RO)?\d{2,10}$/i;

export async function submitStripeOnboardingRequest(
  formData: FormData,
): Promise<SubmitResult> {
  const businessName = String(formData.get('business_name') ?? '').trim();
  const vatNumber = String(formData.get('vat_number') ?? '').trim();
  const expectedTenantId = String(formData.get('tenantId') ?? '');

  if (!businessName || businessName.length < 2 || businessName.length > 200) {
    return { ok: false, error: 'invalid_input', detail: 'business_name' };
  }
  if (vatNumber && !VAT_RE.test(vatNumber)) {
    return { ok: false, error: 'invalid_input', detail: 'vat_number' };
  }
  if (!expectedTenantId) {
    return { ok: false, error: 'invalid_input', detail: 'tenantId' };
  }

  const { user, tenant } = await getActiveTenant().catch(() => ({
    user: null,
    tenant: null,
  }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (tenant.id !== expectedTenantId) {
    return { ok: false, error: 'tenant_mismatch' };
  }
  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  const admin = createAdminClient();

  // stripe_onboarding_requests is not yet in the generated Database types;
  // cast through unknown so we don't have to regenerate types in this PR.
  const sb = admin as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => Promise<{
        error: { message: string } | null;
      }>;
    };
  };

  const { error } = await sb.from('stripe_onboarding_requests').insert({
    tenant_id: expectedTenantId,
    business_name: businessName,
    vat_number: vatNumber || null,
    status: 'PENDING',
  });
  if (error) return { ok: false, error: 'db_error', detail: error.message };

  revalidatePath('/dashboard/settings/payments');
  return { ok: true, status: 'PENDING' };
}
