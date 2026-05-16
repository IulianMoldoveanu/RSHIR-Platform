'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTenantMember, getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';
import { TRUST_CATEGORIES } from '@/lib/ai/master-orchestrator-types';

export type UpdateTrustResult =
  | { ok: true }
  | { ok: false; error: string };

const updateSchema = z.object({
  agent: z.string().trim().min(1).max(64),
  category: z.string().trim().min(1).max(120),
  trustLevel: z.enum(['PROPOSE_ONLY', 'AUTO_REVERSIBLE', 'AUTO_FULL']),
});

// OWNER-only. Upserts a row in `tenant_agent_trust`. The DB-level
// `is_destructive` flag is set from TRUST_CATEGORIES on first insert and
// not touched on update — flipping a category to destructive is a code
// change, not a per-tenant override.
export async function updateTrustLevel(
  expectedTenantId: string,
  raw: { agent: string; category: string; trustLevel: 'PROPOSE_ONLY' | 'AUTO_REVERSIBLE' | 'AUTO_FULL' },
): Promise<UpdateTrustResult> {
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

  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  // Find the canonical entry — if missing, the operator is trying to
  // configure an unknown category. We refuse rather than silently create
  // a row with is_destructive=false for something that should be locked.
  const meta = TRUST_CATEGORIES.find(
    (c) => c.agent === parsed.data.agent && c.category === parsed.data.category,
  );
  if (!meta) return { ok: false, error: 'unknown_category' };

  // Hard guard: if the category is destructive, force PROPOSE_ONLY no
  // matter what the client sent. Backend last line of defense matches
  // the dispatcher-level guard in master-orchestrator.ts.
  const finalLevel = meta.destructive ? 'PROPOSE_ONLY' : parsed.data.trustLevel;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { error } = await sb
    .from('tenant_agent_trust')
    .upsert(
      {
        restaurant_id: expectedTenantId,
        agent_name: parsed.data.agent,
        action_category: parsed.data.category,
        trust_level: finalLevel,
        is_destructive: meta.destructive,
        last_recalibrated_at: new Date().toISOString(),
      },
      { onConflict: 'restaurant_id,agent_name,action_category' },
    );
  if (error) {
    console.warn('[ai-trust/update] upsert failed:', error.message);
    return { ok: false, error: 'update_failed' };
  }

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: user.id,
    action: 'ai_ceo.trust_level_updated',
    entityType: 'tenant_agent_trust',
    metadata: {
      agent: parsed.data.agent,
      category: parsed.data.category,
      trust_level: finalLevel,
    },
  });

  revalidatePath('/dashboard/settings/ai-trust');
  return { ok: true };
}

// F6 trust auto-promotion — OWNER opt-out toggle per (agent, category).
// When false, the daily worker skips this row entirely. Destructive
// categories are not auto-promoted by the worker anyway (defense in
// depth in `trust-promote.ts`), but we still allow the toggle so the UI
// state matches what the OWNER sees.
const toggleSchema = z.object({
  agent: z.string().trim().min(1).max(64),
  category: z.string().trim().min(1).max(120),
  eligible: z.boolean(),
});

export async function toggleAutoPromoteEligible(
  expectedTenantId: string,
  raw: { agent: string; category: string; eligible: boolean },
): Promise<UpdateTrustResult> {
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

  const parsed = toggleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const meta = TRUST_CATEGORIES.find(
    (c) => c.agent === parsed.data.agent && c.category === parsed.data.category,
  );
  if (!meta) return { ok: false, error: 'unknown_category' };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  // Look up the existing row first so we don't clobber the operator's
  // trust_level when they only meant to flip the eligibility flag.
  const { data: existing } = await sb
    .from('tenant_agent_trust')
    .select('id')
    .eq('restaurant_id', expectedTenantId)
    .eq('agent_name', parsed.data.agent)
    .eq('action_category', parsed.data.category)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await sb
      .from('tenant_agent_trust')
      .update({ auto_promote_eligible: parsed.data.eligible })
      .eq('id', existing.id);
    if (error) {
      console.warn('[ai-trust/toggle-auto-promote] update failed:', error.message);
      return { ok: false, error: 'update_failed' };
    }
  } else {
    const { error } = await sb.from('tenant_agent_trust').insert({
      restaurant_id: expectedTenantId,
      agent_name: parsed.data.agent,
      action_category: parsed.data.category,
      trust_level: 'PROPOSE_ONLY',
      is_destructive: meta.destructive,
      auto_promote_eligible: parsed.data.eligible,
    });
    if (error) {
      console.warn('[ai-trust/toggle-auto-promote] insert failed:', error.message);
      return { ok: false, error: 'update_failed' };
    }
  }

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: user.id,
    action: 'ai_ceo.trust_auto_promote_toggled',
    entityType: 'tenant_agent_trust',
    metadata: {
      agent: parsed.data.agent,
      category: parsed.data.category,
      eligible: parsed.data.eligible,
    },
  });

  revalidatePath('/dashboard/settings/ai-trust');
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// Monthly budget editor
// ────────────────────────────────────────────────────────────

// OWNER-only. Patches `tenants.settings.ai.monthly_budget_cents`. The
// dispatcher's `checkBudget` resolver in `_shared/agent-cost.ts` reads
// this value to gate every non-master intent — when month-to-date spend
// exceeds the cap the dispatcher returns PROPOSED instead of executing.
// Until this action shipped the budget could only be set via DB query.
//
// Bounds: 100 (≈$1, defends against a typo'd 0 or negative locking the
// tenant out) to 100_000 (≈$1000, defends against a typo'd extra zero).
// Returns `bounds` on invalid input so the UI can show the constraint.
const monthlyBudgetSchema = z.object({
  monthly_budget_cents: z.number().int().min(100).max(100_000),
});

export type UpdateBudgetResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateMonthlyBudgetCents(
  expectedTenantId: string,
  raw: { monthly_budget_cents: number },
): Promise<UpdateBudgetResult> {
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

  const parsed = monthlyBudgetSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'bounds' };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  // Read current settings, deep-merge ai.monthly_budget_cents, write back.
  // tenants.settings is JSONB so we can't UPDATE just the leaf — we have
  // to round-trip the whole blob. Same pattern as other settings editors
  // (storefront branding, notifications, etc.).
  const { data: row, error: readErr } = await sb
    .from('tenants')
    .select('settings')
    .eq('id', expectedTenantId)
    .maybeSingle();
  if (readErr) {
    console.warn('[ai-trust/budget] tenant read failed:', readErr.message);
    return { ok: false, error: 'read_failed' };
  }
  const cur = (row?.settings as Record<string, unknown>) ?? {};
  const ai = (cur.ai as Record<string, unknown>) ?? {};
  const nextSettings = {
    ...cur,
    ai: { ...ai, monthly_budget_cents: parsed.data.monthly_budget_cents },
  };

  const { error: writeErr } = await sb
    .from('tenants')
    .update({ settings: nextSettings })
    .eq('id', expectedTenantId);
  if (writeErr) {
    console.warn('[ai-trust/budget] tenant write failed:', writeErr.message);
    return { ok: false, error: 'update_failed' };
  }

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: user.id,
    action: 'ai_ceo.monthly_budget_updated',
    entityType: 'tenant',
    entityId: expectedTenantId,
    metadata: {
      monthly_budget_cents: parsed.data.monthly_budget_cents,
    },
  });

  revalidatePath('/dashboard/settings/ai-trust');
  revalidatePath('/dashboard/ai-ceo');
  return { ok: true };
}
