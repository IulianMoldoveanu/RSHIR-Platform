'use server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';

// Which sites may frame this tenant's order widget. Read on the storefront by
// middleware to build `Content-Security-Policy: frame-ancestors` — so this
// list is a security boundary, not a preference. A tenant that registers
// nothing gets no third-party framing at all.
//
// The tenant's own verified custom_domain is allowed automatically and is NOT
// stored here; this list is for the case where the storefront lives on
// <slug>.hirforyou.ro but the marketing site is on a different domain.

export type EmbedOriginsResult =
  | { ok: true; origins: string[] }
  | {
      ok: false;
      error: 'forbidden_owner_only' | 'unauthenticated' | 'invalid_input' | 'db_error';
      detail?: string;
    };

// Mirrors ORIGIN_RE in restaurant-web's lib/embed-origins.ts. Rejecting here
// too means a bad value never reaches the header builder in the first place.
const ORIGIN_RE = /^https:\/\/(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{2,5})?$/;
const MAX_ORIGINS = 10;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Accepts one origin per line; returns the valid ones and the rejects. */
export function parseOrigins(raw: string): { origins: string[]; invalid: string[] } {
  const origins: string[] = [];
  const invalid: string[] = [];
  for (const line of raw.split(/[\n,]/)) {
    const value = line.trim().toLowerCase().replace(/\/+$/, '');
    if (!value) continue;
    // A pasted "example.com" is an obvious intent — upgrade it rather than
    // making the owner learn what an origin is.
    const candidate = /^https?:\/\//.test(value) ? value.replace(/^http:\/\//, 'https://') : `https://${value}`;
    if (!ORIGIN_RE.test(candidate)) invalid.push(line.trim());
    else if (!origins.includes(candidate)) origins.push(candidate);
  }
  return { origins: origins.slice(0, MAX_ORIGINS), invalid };
}

export async function saveEmbedOriginsAction(
  raw: string,
  expectedTenantId: string,
): Promise<EmbedOriginsResult> {
  const { user, tenant } = await getActiveTenant().catch(() => ({ user: null, tenant: null }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (!expectedTenantId || tenant.id !== expectedTenantId) {
    return { ok: false, error: 'invalid_input', detail: 'tenant_mismatch' };
  }
  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  const { origins, invalid } = parseOrigins(typeof raw === 'string' ? raw : '');
  if (invalid.length) {
    return { ok: false, error: 'invalid_input', detail: invalid.slice(0, 3).join(', ') };
  }

  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', expectedTenantId)
    .single();
  if (readErr || !existing) return { ok: false, error: 'db_error', detail: readErr?.message };

  const settings = isPlainObject(existing.settings) ? { ...existing.settings } : {};
  const embed = isPlainObject(settings.embed) ? { ...settings.embed } : {};
  embed.allowed_origins = origins;
  settings.embed = embed;

  const { error: writeErr } = await admin
    .from('tenants')
    .update({ settings: settings as never })
    .eq('id', expectedTenantId);
  if (writeErr) return { ok: false, error: 'db_error', detail: writeErr.message };

  revalidatePath('/dashboard/settings/embed');
  return { ok: true, origins };
}
