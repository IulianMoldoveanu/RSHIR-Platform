'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { assertTenantMember, getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';
import { updateTrustLevel, type TrustLevel } from '@/lib/agents/trust';

const setTrustSchema = z.object({
  agentName: z.string().trim().min(1).max(64),
  actionCategory: z.string().trim().min(1).max(120),
  trustLevel: z.enum(['PROPOSE_ONLY', 'AUTO_REVERSIBLE', 'AUTO_FULL']),
});

export type SetTrustResult = { ok: true } | { ok: false; error: string };

// OWNER-only: change one (agent, action_category) trust level.
// Server-side cap on destructive categories — see updateTrustLevel.
export async function setAgentTrustLevel(
  expectedTenantId: string,
  raw: { agentName: string; actionCategory: string; trustLevel: TrustLevel },
): Promise<SetTrustResult> {
  if (!expectedTenantId) return { ok: false, error: 'missing_tenant_id' };

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const { tenant } = await getActiveTenant();
  if (tenant.id !== expectedTenantId) return { ok: false, error: 'tenant_mismatch' };
  await assertTenantMember(user.id, expectedTenantId);

  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden' };

  const parsed = setTrustSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const result = await updateTrustLevel(
    expectedTenantId,
    parsed.data.agentName,
    parsed.data.actionCategory,
    parsed.data.trustLevel,
  );
  if (!result.ok) {
    console.error('[ai-trust/actions] updateTrustLevel failed', result.error);
    return { ok: false, error: 'db_error' };
  }

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: user.id,
    action: 'ai_ceo.trust_level_updated',
    metadata: {
      agent_name: parsed.data.agentName,
      action_category: parsed.data.actionCategory,
      trust_level: parsed.data.trustLevel,
    },
  });

  revalidatePath('/dashboard/settings/ai-trust');
  return { ok: true };
}
