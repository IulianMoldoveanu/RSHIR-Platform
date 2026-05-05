'use server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';

export type SubmitResult =
  | { ok: true; status: 'PENDING' }
  | { ok: false; error: string; detail?: string };

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
