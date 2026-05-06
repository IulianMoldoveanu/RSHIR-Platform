'use server';

// Lane AGGREGATOR-EMAIL-INTAKE — PR 3 of 3.
// Server actions for /dashboard/settings/aggregator-intake.
// All actions are OWNER-gated.

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';

const SETTINGS_PATH = '/dashboard/settings/aggregator-intake';
const INBOX_PATH = '/dashboard/orders/aggregator-inbox';

export type ActionResult =
  | { ok: true; data?: Record<string, unknown> }
  | { ok: false; error: string };

async function requireOwner(
  expectedTenantId: string,
): Promise<{ userId: string; tenantId: string } | { error: string }> {
  if (!expectedTenantId) return { error: 'missing_tenant_id' };
  const { user, tenant } = await getActiveTenant().catch(() => ({
    user: null as null,
    tenant: null as null,
  }));
  if (!user || !tenant) return { error: 'Neautentificat.' };
  if (tenant.id !== expectedTenantId) return { error: 'tenant_mismatch' };
  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER')
    return { error: 'Acces interzis: doar OWNER poate modifica preluarea email.' };
  return { userId: user.id, tenantId: expectedTenantId };
}

function makeAliasLocal(slug: string): string {
  // sanitize slug to a-z0-9-, prefix "comenzi-", clamp to 40 chars
  const safe = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
  return `comenzi-${safe || 'restaurant'}`.slice(0, 40);
}

function makeSecret(): string {
  return randomBytes(24).toString('hex'); // 48-char hex
}

/**
 * Enables the feature for this tenant and provisions an alias if missing.
 * Idempotent — calling twice returns the existing alias.
 */
export async function enableIntake(
  expectedTenantId: string,
  tenantSlug: string,
): Promise<ActionResult> {
  const guard = await requireOwner(expectedTenantId);
  if ('error' in guard) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  // tenants.feature_flags is in the DB (migration 20260506_013) but not yet
  // in the generated supabase-types — cast through unknown.
  const tenantsSb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: { feature_flags: Record<string, unknown> | null } | null;
            error: { message: string } | null;
          }>;
        };
      };
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };

  // Flip the feature flag.
  const { data: tRow, error: tErr } = await tenantsSb
    .from('tenants')
    .select('feature_flags')
    .eq('id', guard.tenantId)
    .maybeSingle();
  if (tErr) return { ok: false, error: tErr.message };
  const flags = (tRow?.feature_flags as Record<string, unknown> | null) ?? {};
  const nextFlags = { ...flags, aggregator_email_intake_enabled: true };
  const { error: updErr } = await tenantsSb
    .from('tenants')
    .update({ feature_flags: nextFlags })
    .eq('id', guard.tenantId);
  if (updErr) return { ok: false, error: updErr.message };

  // Provision alias if missing.
  // Cast through unknown — table not yet in generated types.
  const aliasSb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => {
          single: () => Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{
          error: { message: string } | null;
        }>;
      };
    };
  };

  const { data: existing } = await aliasSb
    .from('aggregator_intake_aliases')
    .select('alias_local')
    .eq('tenant_id', guard.tenantId)
    .maybeSingle();

  if (!existing) {
    const aliasLocal = makeAliasLocal(tenantSlug);
    const secret = makeSecret();
    // Best-effort: if the alias_local is already taken (collision across
    // tenants with similar slugs), append a random suffix.
    let finalAlias = aliasLocal;
    for (let i = 0; i < 3; i++) {
      const attempt =
        i === 0 ? aliasLocal : `${aliasLocal.slice(0, 36)}-${randomBytes(2).toString('hex')}`;
      const { error: insErr } = await aliasSb
        .from('aggregator_intake_aliases')
        .insert({ tenant_id: guard.tenantId, alias_local: attempt, secret, enabled: true })
        .select('alias_local')
        .single();
      if (!insErr) {
        finalAlias = attempt;
        break;
      }
      if (!/duplicate|unique/i.test(insErr.message)) {
        return { ok: false, error: insErr.message };
      }
      if (i === 2) return { ok: false, error: 'alias_collision_max_retries' };
    }
    revalidatePath(SETTINGS_PATH);
    return { ok: true, data: { alias_local: finalAlias } };
  }

  revalidatePath(SETTINGS_PATH);
  return { ok: true, data: { alias_local: existing.alias_local as string } };
}

/**
 * Disables the feature flag (does NOT delete the alias — admin can re-enable
 * without re-publishing forwarding rules to restaurants).
 */
export async function disableIntake(expectedTenantId: string): Promise<ActionResult> {
  const guard = await requireOwner(expectedTenantId);
  if ('error' in guard) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const tenantsSb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: { feature_flags: Record<string, unknown> | null } | null;
            error: { message: string } | null;
          }>;
        };
      };
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  const { data: tRow } = await tenantsSb
    .from('tenants')
    .select('feature_flags')
    .eq('id', guard.tenantId)
    .maybeSingle();
  const flags = (tRow?.feature_flags as Record<string, unknown> | null) ?? {};
  const nextFlags = { ...flags, aggregator_email_intake_enabled: false };
  const { error } = await tenantsSb
    .from('tenants')
    .update({ feature_flags: nextFlags })
    .eq('id', guard.tenantId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/**
 * Manually applies a PARSED job → restaurant_orders row. Used when the
 * Anthropic parse landed below the auto-apply confidence bar.
 */
export async function applyParsedJob(
  expectedTenantId: string,
  jobId: string,
): Promise<ActionResult> {
  const guard = await requireOwner(expectedTenantId);
  if ('error' in guard) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{
              data: Record<string, unknown> | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => {
          single: () => Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{
          error: { message: string } | null;
        }>;
      };
    };
  };

  const { data: job, error: jobErr } = await sb
    .from('aggregator_email_jobs')
    .select('id, status, detected_source, parsed_data, applied_order_id')
    .eq('id', jobId)
    .eq('tenant_id', guard.tenantId)
    .maybeSingle();
  if (jobErr) return { ok: false, error: jobErr.message };
  if (!job) return { ok: false, error: 'Jobul nu a fost găsit.' };
  if (job.applied_order_id) return { ok: false, error: 'Comanda a fost deja aplicată.' };
  if (!['PARSED'].includes(job.status as string))
    return { ok: false, error: `Statusul curent (${job.status}) nu permite aplicarea.` };

  const parsed = job.parsed_data as Record<string, unknown> | null;
  if (!parsed) return { ok: false, error: 'Datele parsate lipsesc.' };
  const items = Array.isArray(parsed.items) ? (parsed.items as Record<string, unknown>[]) : [];
  if (items.length === 0) return { ok: false, error: 'Nu există linii de comandă în date.' };

  const ordersSb = admin as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => {
          single: () => Promise<{
            data: { id: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };

  const notesParts = [
    parsed.external_order_id ? `${job.detected_source} #${parsed.external_order_id}` : null,
    parsed.customer_name as string | undefined,
    parsed.customer_phone as string | undefined,
    parsed.delivery_address as string | undefined,
    parsed.notes as string | undefined,
  ].filter((v): v is string => typeof v === 'string' && v.length > 0);

  const { data: order, error: orderErr } = await ordersSb
    .from('restaurant_orders')
    .insert({
      tenant_id: guard.tenantId,
      items,
      subtotal_ron: Number(parsed.subtotal_ron ?? 0),
      delivery_fee_ron: Number(parsed.delivery_fee_ron ?? 0),
      total_ron: Number(parsed.total_ron ?? 0),
      status: 'CONFIRMED',
      payment_status: 'PAID',
      source: job.detected_source,
      notes: notesParts.join(' • ').slice(0, 1000),
    })
    .select('id')
    .single();

  if (orderErr || !order) {
    return { ok: false, error: orderErr?.message ?? 'Aplicare eșuată.' };
  }

  await sb
    .from('aggregator_email_jobs')
    .update({ status: 'APPLIED', applied_order_id: order.id, error_text: null })
    .eq('id', jobId);

  revalidatePath(INBOX_PATH);
  revalidatePath('/dashboard/orders');
  return { ok: true, data: { order_id: order.id } };
}
