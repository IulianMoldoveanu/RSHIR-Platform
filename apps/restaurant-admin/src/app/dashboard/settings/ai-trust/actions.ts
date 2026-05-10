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
