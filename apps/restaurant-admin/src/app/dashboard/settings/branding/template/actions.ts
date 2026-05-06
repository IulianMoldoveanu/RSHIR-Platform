'use server';

// Lane THEMES (2026-05-06): OWNER-only setter for tenants.template_slug.
// The 5 vertical templates ship in @hir/restaurant-templates; the storefront
// reads template_slug at request time and projects accent + heading/body
// fonts onto the layout. Existing tenants stay on NULL until the OWNER
// explicitly opts in here.

import { revalidatePath } from 'next/cache';
import { ALL_TEMPLATES, type RestaurantTemplateSlug } from '@hir/restaurant-templates';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit, type AuditAction } from '@/lib/audit';

const VALID_SLUGS = new Set<string>(ALL_TEMPLATES.map((t) => t.slug));

export type SetTemplateResult =
  | { ok: true; template_slug: RestaurantTemplateSlug | null }
  | {
      ok: false;
      error:
        | 'unauthenticated'
        | 'forbidden_owner_only'
        | 'tenant_mismatch'
        | 'invalid_slug'
        | 'db_error';
      detail?: string;
    };

export async function setTemplateSlug(
  slug: string | null,
  expectedTenantId: string,
): Promise<SetTemplateResult> {
  if (!expectedTenantId) return { ok: false, error: 'invalid_slug', detail: 'tenantId required' };
  if (slug !== null && !VALID_SLUGS.has(slug)) {
    return { ok: false, error: 'invalid_slug', detail: String(slug) };
  }

  const { user, tenant } = await getActiveTenant().catch(() => ({
    user: null,
    tenant: null,
  }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (tenant.id !== expectedTenantId) return { ok: false, error: 'tenant_mismatch' };

  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  const admin = createAdminClient();
  // template_slug is not yet in @hir/supabase-types; cast through unknown
  // (same pattern audit.ts uses for the audit_log table).
  const sb = admin as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  const { error } = await sb
    .from('tenants')
    .update({ template_slug: slug })
    .eq('id', expectedTenantId);
  if (error) return { ok: false, error: 'db_error', detail: error.message };

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: user.id,
    // Reuses existing color_changed audit action — schema-touching but
    // conceptually a branding mutation. Adding a new AuditAction value
    // is a wider type change; sticking to the existing taxonomy keeps
    // the PR additive-only.
    action: 'branding.color_changed' satisfies AuditAction,
    entityType: 'tenant',
    entityId: expectedTenantId,
    metadata: { template_slug: slug, kind: 'template_changed' },
  });

  revalidatePath('/dashboard/settings/branding');
  revalidatePath('/dashboard/settings/branding/template');
  return { ok: true, template_slug: (slug as RestaurantTemplateSlug | null) ?? null };
}
