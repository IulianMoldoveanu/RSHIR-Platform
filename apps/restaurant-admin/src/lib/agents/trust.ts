// HIR AI Tenant Orchestrator — Trust calibration helper.
//
// Per-tenant × per-agent × per-action-category trust level lookup +
// approval/rejection counters used by the Sprint 13 self-improvement loop.
//
// Defaults to PROPOSE_ONLY when no row exists — the safe choice for any
// tenant the orchestrator hasn't onboarded yet (default-deny).
//
// All reads/writes go through the service-role admin client; tenant
// membership is the caller's responsibility (server actions already
// verify it via assertTenantMember + getTenantRole). RLS still applies
// for any authenticated-key query path.

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export type TrustLevel = 'PROPOSE_ONLY' | 'AUTO_REVERSIBLE' | 'AUTO_FULL';

export type TrustRow = {
  agent_name: string;
  action_category: string;
  trust_level: TrustLevel;
  is_destructive: boolean;
  approval_count: number;
  rejection_count: number;
  last_recalibrated_at: string | null;
};

const TABLE = 'agent_trust_calibration';

// Default: deny autonomy. Caller can opt in per (agent, category) by
// upserting a row. Destructive categories are forced back to PROPOSE_ONLY
// at write time — see updateTrustLevel.
export async function getTrustLevel(
  restaurantId: string,
  agentName: string,
  actionCategory: string,
): Promise<TrustLevel> {
  try {
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (
            c: string,
            v: string,
          ) => {
            eq: (
              c: string,
              v: string,
            ) => {
              eq: (
                c: string,
                v: string,
              ) => {
                maybeSingle: () => Promise<{
                  data: { trust_level: string } | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      };
    };
    const { data, error } = await admin
      .from(TABLE)
      .select('trust_level')
      .eq('restaurant_id', restaurantId)
      .eq('agent_name', agentName)
      .eq('action_category', actionCategory)
      .maybeSingle();
    if (error) {
      console.warn('[trust] getTrustLevel failed', error.message);
      return 'PROPOSE_ONLY';
    }
    const lvl = (data?.trust_level ?? 'PROPOSE_ONLY') as TrustLevel;
    if (lvl !== 'PROPOSE_ONLY' && lvl !== 'AUTO_REVERSIBLE' && lvl !== 'AUTO_FULL') {
      return 'PROPOSE_ONLY';
    }
    return lvl;
  } catch (err) {
    console.warn('[trust] getTrustLevel threw', (err as Error).message);
    return 'PROPOSE_ONLY';
  }
}

// Lists every trust row for a tenant. Used by the settings page to render
// the table grouped by agent.
export async function listTrustRowsForTenant(restaurantId: string): Promise<TrustRow[]> {
  try {
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (c: string, v: string) => {
            order: (
              c: string,
              opts: { ascending: boolean },
            ) => Promise<{ data: TrustRow[] | null; error: { message: string } | null }>;
          };
        };
      };
    };
    const { data, error } = await admin
      .from(TABLE)
      .select(
        'agent_name, action_category, trust_level, is_destructive, approval_count, rejection_count, last_recalibrated_at',
      )
      .eq('restaurant_id', restaurantId)
      .order('agent_name', { ascending: true });
    if (error) {
      console.warn('[trust] listTrustRowsForTenant failed', error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.warn('[trust] listTrustRowsForTenant threw', (err as Error).message);
    return [];
  }
}

// Server-side write — caller must already have verified OWNER membership.
// If is_destructive is true on the existing row, level is capped at
// PROPOSE_ONLY regardless of input (policy guard, defense in depth on top
// of the UI which already disables the picker).
export async function updateTrustLevel(
  restaurantId: string,
  agentName: string,
  actionCategory: string,
  trustLevel: TrustLevel,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient() as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => {
            eq: (c: string, v: string) => {
              maybeSingle: () => Promise<{
                data: { is_destructive: boolean } | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
      upsert: (
        row: Record<string, unknown>,
        opts: { onConflict: string },
      ) => Promise<{ error: { message: string } | null }>;
    };
  };

  const { data: existing, error: readErr } = await admin
    .from(TABLE)
    .select('is_destructive')
    .eq('restaurant_id', restaurantId)
    .eq('agent_name', agentName)
    .eq('action_category', actionCategory)
    .maybeSingle();
  if (readErr) {
    return { ok: false, error: readErr.message };
  }

  const cappedLevel: TrustLevel =
    existing?.is_destructive && trustLevel !== 'PROPOSE_ONLY' ? 'PROPOSE_ONLY' : trustLevel;

  const { error: upsertErr } = await admin.from(TABLE).upsert(
    {
      restaurant_id: restaurantId,
      agent_name: agentName,
      action_category: actionCategory,
      trust_level: cappedLevel,
      last_recalibrated_at: new Date().toISOString(),
    },
    { onConflict: 'restaurant_id,agent_name,action_category' },
  );
  if (upsertErr) {
    return { ok: false, error: upsertErr.message };
  }
  return { ok: true };
}

// Self-improvement loop hooks — called from server actions that record
// owner reaction to a proposed run. Idempotent counter bumps; absence of
// a row is fine (the caller can still proceed with PROPOSE_ONLY default).
export async function recordApproval(
  restaurantId: string,
  agentName: string,
  actionCategory: string,
): Promise<void> {
  await bumpCounter(restaurantId, agentName, actionCategory, 'approval_count');
}

export async function recordRejection(
  restaurantId: string,
  agentName: string,
  actionCategory: string,
): Promise<void> {
  await bumpCounter(restaurantId, agentName, actionCategory, 'rejection_count');
}

async function bumpCounter(
  restaurantId: string,
  agentName: string,
  actionCategory: string,
  column: 'approval_count' | 'rejection_count',
): Promise<void> {
  try {
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (c: string, v: string) => {
            eq: (c: string, v: string) => {
              eq: (c: string, v: string) => {
                maybeSingle: () => Promise<{
                  data: { approval_count: number; rejection_count: number } | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
        upsert: (
          row: Record<string, unknown>,
          opts: { onConflict: string },
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
    const { data, error } = await admin
      .from(TABLE)
      .select('approval_count, rejection_count')
      .eq('restaurant_id', restaurantId)
      .eq('agent_name', agentName)
      .eq('action_category', actionCategory)
      .maybeSingle();
    if (error) {
      console.warn('[trust] bumpCounter read failed', error.message);
      return;
    }
    const next = (data?.[column] ?? 0) + 1;
    const otherCol: 'approval_count' | 'rejection_count' =
      column === 'approval_count' ? 'rejection_count' : 'approval_count';
    const { error: upsertErr } = await admin.from(TABLE).upsert(
      {
        restaurant_id: restaurantId,
        agent_name: agentName,
        action_category: actionCategory,
        [column]: next,
        [otherCol]: data?.[otherCol] ?? 0,
      },
      { onConflict: 'restaurant_id,agent_name,action_category' },
    );
    if (upsertErr) {
      console.warn('[trust] bumpCounter upsert failed', upsertErr.message);
    }
  } catch (err) {
    console.warn('[trust] bumpCounter threw', (err as Error).message);
  }
}
