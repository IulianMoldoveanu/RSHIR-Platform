'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTenantMember, getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';
import { friendlyDbError } from '@/lib/db-error';

const recommendationActionSchema = z.object({
  id: z.string().uuid(),
});

export type GrowthActionResult =
  | { ok: true }
  | { ok: false; error: string };

// Shared OWNER-only guard + tenant scope check. Mirrors the pattern in
// ./actions.ts: never trust a client-supplied tenant, always re-resolve via
// getActiveTenant() and ensure the expected tenant matches the active one.
async function guard(
  expectedTenantId: string,
): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  if (!expectedTenantId) return { ok: false, error: 'missing_tenant_id' };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const { tenant } = await getActiveTenant();
  if (tenant.id !== expectedTenantId) return { ok: false, error: 'tenant_mismatch' };
  await assertTenantMember(user.id, expectedTenantId);

  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden' };

  return { ok: true, userId: user.id };
}

// OWNER-only: flip a growth_recommendations row to `approved`. The row must
// still be `pending` — once decided, the action is a no-op (`already_decided`)
// to keep the operator workflow idempotent and audit-clean.
//
// Tenant scoping is enforced by including tenant_id in the WHERE clauses on
// both the read and the update, so even a stale UI cannot mutate another
// tenant's row. `decided_by` is set to auth.uid() (the live caller), not a
// sentinel — the column is `uuid references auth.users(id) on delete set null`.
//
// This handler intentionally does NOT call execute() — the recommendation is
// merely marked approved; manual application of the suggested_action_ro is a
// follow-up surface (today the bot ships every row with
// auto_action_available=false).
export async function approveRecommendation(
  id: string,
  expectedTenantId: string,
): Promise<GrowthActionResult> {
  const g = await guard(expectedTenantId);
  if (!g.ok) return g;

  const parsed = recommendationActionSchema.safeParse({ id });
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const admin = createAdminClient();
  // growth_recommendations is not in the generated supabase types yet (its
  // migration ships in the growth-agent rollout). Cast through unknown for
  // typecheck — the column shape is asserted at runtime by the read below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { data: row, error: readErr } = await sb
    .from('growth_recommendations')
    .select('id, status')
    .eq('id', parsed.data.id)
    .eq('tenant_id', expectedTenantId)
    .maybeSingle();
  if (readErr) {
    return {
      ok: false,
      error: friendlyDbError(readErr, 'încărcarea recomandării').message,
    };
  }
  if (!row) return { ok: false, error: 'not_found' };
  if (row.status !== 'pending') return { ok: false, error: 'already_decided' };

  const { error: writeErr } = await sb
    .from('growth_recommendations')
    .update({
      status: 'approved',
      decided_at: new Date().toISOString(),
      decided_by: g.userId,
    })
    .eq('id', parsed.data.id)
    .eq('tenant_id', expectedTenantId);
  if (writeErr) {
    return {
      ok: false,
      error: friendlyDbError(writeErr, 'aprobarea recomandării').message,
    };
  }

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: g.userId,
    action: 'ai_ceo.recommendation_approved',
    entityType: 'growth_recommendation',
    entityId: parsed.data.id,
  });

  revalidatePath('/dashboard/ai-ceo');
  return { ok: true };
}

// OWNER-only: flip a growth_recommendations row to `dismissed`. Same guard +
// idempotency rules as approve.
export async function dismissRecommendation(
  id: string,
  expectedTenantId: string,
): Promise<GrowthActionResult> {
  const g = await guard(expectedTenantId);
  if (!g.ok) return g;

  const parsed = recommendationActionSchema.safeParse({ id });
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { data: row, error: readErr } = await sb
    .from('growth_recommendations')
    .select('id, status')
    .eq('id', parsed.data.id)
    .eq('tenant_id', expectedTenantId)
    .maybeSingle();
  if (readErr) {
    return {
      ok: false,
      error: friendlyDbError(readErr, 'încărcarea recomandării').message,
    };
  }
  if (!row) return { ok: false, error: 'not_found' };
  if (row.status !== 'pending') return { ok: false, error: 'already_decided' };

  const { error: writeErr } = await sb
    .from('growth_recommendations')
    .update({
      status: 'dismissed',
      decided_at: new Date().toISOString(),
      decided_by: g.userId,
    })
    .eq('id', parsed.data.id)
    .eq('tenant_id', expectedTenantId);
  if (writeErr) {
    return {
      ok: false,
      error: friendlyDbError(writeErr, 'respingerea recomandării').message,
    };
  }

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: g.userId,
    action: 'ai_ceo.recommendation_dismissed',
    entityType: 'growth_recommendation',
    entityId: parsed.data.id,
  });

  revalidatePath('/dashboard/ai-ceo');
  return { ok: true };
}
