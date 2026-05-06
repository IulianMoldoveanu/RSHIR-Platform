'use server';

// Theme picker wizard actions (2026-05-07).
// Two actions:
//   previewTheme  — writes settings.theme_preview_slug (ephemeral; storefront
//                   reads it when cookie hir-theme-preview=1 is present)
//   applyTheme    — promotes preview to tenants.template_slug (the real column)
//
// Zero schema migrations: template_slug already exists; theme_preview_slug
// lives in the settings JSONB alongside existing branding keys.

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ALL_TEMPLATES, type RestaurantTemplateSlug } from '@hir/restaurant-templates';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit, type AuditAction } from '@/lib/audit';

const VALID_SLUGS = new Set<string>(ALL_TEMPLATES.map((t) => t.slug));

export type ThemeActionResult =
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

// ── helpers ──────────────────────────────────────────────────────────────────

type ResolveOwnerError = {
  error: 'unauthenticated' | 'tenant_mismatch' | 'forbidden_owner_only';
};
type ResolveOwnerOk = {
  user: { id: string };
  tenant: { id: string; slug: string };
};
type ResolveOwnerResult = ResolveOwnerError | ResolveOwnerOk;

async function resolveOwner(expectedTenantId: string): Promise<ResolveOwnerResult> {
  const { user, tenant } = await getActiveTenant().catch(() => ({
    user: null as null,
    tenant: null as null,
  }));
  if (!user || !tenant) return { error: 'unauthenticated' as const };
  if (tenant.id !== expectedTenantId) return { error: 'tenant_mismatch' as const };
  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { error: 'forbidden_owner_only' as const };
  return { user, tenant };
}

type AdminSb = {
  from: (t: string) => {
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
    select: (s: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{
          data: { settings: Record<string, unknown> | null } | null;
        }>;
      };
    };
  };
};

// ── previewTheme ──────────────────────────────────────────────────────────────

/**
 * Temporarily stores slug in settings.theme_preview_slug so the storefront
 * can render a live preview in the wizard iframe (cookie-gated). Does NOT
 * touch template_slug — the "live" theme is unchanged.
 */
export async function previewTheme(
  slug: string | null,
  expectedTenantId: string,
): Promise<ThemeActionResult> {
  if (!expectedTenantId) return { ok: false, error: 'invalid_slug', detail: 'tenantId required' };
  if (slug !== null && !VALID_SLUGS.has(slug)) {
    return { ok: false, error: 'invalid_slug', detail: String(slug) };
  }

  const resolved = await resolveOwner(expectedTenantId);
  if ('error' in resolved) return { ok: false, error: resolved.error };
  const { user } = resolved;

  const admin = createAdminClient() as unknown as AdminSb;

  // Read current settings to merge (JSONB partial update via RPC not
  // available here; fetch + merge + write is safe for low-freq admin action).
  const { data: row } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', expectedTenantId)
    .maybeSingle();

  const currentSettings = (row?.settings ?? {}) as Record<string, unknown>;
  const updatedSettings = { ...currentSettings, theme_preview_slug: slug };

  const { error } = await admin
    .from('tenants')
    .update({ settings: updatedSettings })
    .eq('id', expectedTenantId);

  if (error) return { ok: false, error: 'db_error', detail: error.message };

  // Set a short-lived cookie so the preview iframe knows to use the preview
  // slug instead of the live template_slug. httpOnly=false so the client
  // can clear it when the wizard closes.
  const jar = cookies();
  jar.set('hir-theme-preview', expectedTenantId, {
    maxAge: 60 * 30, // 30 min
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: user.id,
    action: 'branding.theme_previewed' satisfies AuditAction,
    entityType: 'tenant',
    entityId: expectedTenantId,
    metadata: { theme_preview_slug: slug },
  });

  return { ok: true, template_slug: (slug as RestaurantTemplateSlug | null) ?? null };
}

// ── applyTheme ───────────────────────────────────────────────────────────────

/**
 * Promotes the selected slug to tenants.template_slug (live storefront) and
 * clears theme_preview_slug from settings JSONB + the preview cookie.
 */
export async function applyTheme(
  slug: string | null,
  expectedTenantId: string,
): Promise<ThemeActionResult> {
  if (!expectedTenantId) return { ok: false, error: 'invalid_slug', detail: 'tenantId required' };
  if (slug !== null && !VALID_SLUGS.has(slug)) {
    return { ok: false, error: 'invalid_slug', detail: String(slug) };
  }

  const resolved = await resolveOwner(expectedTenantId);
  if ('error' in resolved) return { ok: false, error: resolved.error };
  const { user } = resolved;

  const admin = createAdminClient() as unknown as AdminSb;

  // Clear preview slug from settings JSONB.
  const { data: row } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', expectedTenantId)
    .maybeSingle();

  const currentSettings = (row?.settings ?? {}) as Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { theme_preview_slug: _drop, ...rest } = currentSettings;
  const updatedSettings = rest;

  const { error } = await admin
    .from('tenants')
    .update({ template_slug: slug, settings: updatedSettings })
    .eq('id', expectedTenantId);

  if (error) return { ok: false, error: 'db_error', detail: error.message };

  // Clear preview cookie.
  const jar = cookies();
  jar.set('hir-theme-preview', '', { maxAge: 0, path: '/' });

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: user.id,
    action: 'branding.theme_applied' satisfies AuditAction,
    entityType: 'tenant',
    entityId: expectedTenantId,
    metadata: { template_slug: slug },
  });

  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/settings/storefront/theme');
  revalidatePath('/dashboard/settings/branding');
  revalidatePath('/dashboard/settings/branding/template');
  return { ok: true, template_slug: (slug as RestaurantTemplateSlug | null) ?? null };
}
