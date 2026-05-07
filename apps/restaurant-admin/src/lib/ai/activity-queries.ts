// Server-only read helpers for the AI Activity ledger surface.
//
// Pulls rows from `copilot_agent_runs` filtered by tenant, projecting the
// columns added in 20260608_002_ai_master_orchestrator.sql plus the
// pre-existing fields. Best-effort: degrades to [] if the migration
// hasn't applied yet so the dashboard doesn't crash mid-deploy.

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { RunState, AgentName } from './master-orchestrator-types';

export type AgentRunRow = {
  id: string;
  agentName: string | null;
  actionType: string | null;
  state: RunState | null;
  summary: string | null;
  payload: Record<string, unknown> | null;
  preState: Record<string, unknown> | null;
  createdAt: string | null;
  approvedAt: string | null;
  revertedAt: string | null;
  revertedReason: string | null;
  parentRunId: string | null;
  // Convenience flag computed in this layer: revert button enabled when
  // the row is EXECUTED, not yet reverted, has a non-empty pre_state, and
  // is < 24h old.
  canRevert: boolean;
  // True when the row is PROPOSED + approved_at is set. Sprint 12 stops
  // here; Sprint 13 worker picks up these rows and runs execute(). UI
  // shows "Aprobat, în așteptarea execuției" so the OWNER doesn't think
  // the side effect already happened.
  awaitingExecute: boolean;
};

const REVERT_WINDOW_MS = 24 * 60 * 60 * 1000;

function computeCanRevert(row: {
  state: string | null;
  reverted_at: string | null;
  pre_state: unknown;
  created_at: string | null;
}): boolean {
  if (row.state !== 'EXECUTED') return false;
  if (row.reverted_at) return false;
  if (!row.pre_state || typeof row.pre_state !== 'object') return false;
  if (Object.keys(row.pre_state as Record<string, unknown>).length === 0) return false;
  if (!row.created_at) return false;
  const ageMs = Date.now() - new Date(row.created_at).getTime();
  if (Number.isNaN(ageMs)) return false;
  return ageMs <= REVERT_WINDOW_MS;
}

export async function listAgentRuns(
  tenantId: string,
  opts?: { state?: RunState; agent?: AgentName; limit?: number },
): Promise<AgentRunRow[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
    let q = admin
      .from('copilot_agent_runs')
      .select(
        'id, agent_name, action_type, state, summary, payload, pre_state, created_at, approved_at, reverted_at, reverted_reason, parent_run_id',
      )
      .eq('restaurant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (opts?.state) q = q.eq('state', opts.state);
    if (opts?.agent) q = q.eq('agent_name', opts.agent);
    const { data, error } = await q;
    if (error) {
      console.warn('[ai-activity] listAgentRuns:', error.message);
      return [];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((row: any) => ({
      id: String(row.id ?? ''),
      agentName: row.agent_name ?? null,
      actionType: row.action_type ?? null,
      state: (row.state ?? null) as RunState | null,
      summary: row.summary ?? null,
      payload: (row.payload as Record<string, unknown> | null) ?? null,
      preState: (row.pre_state as Record<string, unknown> | null) ?? null,
      createdAt: row.created_at ?? null,
      approvedAt: row.approved_at ?? null,
      revertedAt: row.reverted_at ?? null,
      revertedReason: row.reverted_reason ?? null,
      parentRunId: row.parent_run_id ?? null,
      canRevert: computeCanRevert({
        state: row.state ?? null,
        reverted_at: row.reverted_at ?? null,
        pre_state: row.pre_state,
        created_at: row.created_at ?? null,
      }),
      awaitingExecute: row.state === 'PROPOSED' && Boolean(row.approved_at),
    }));
  } catch (err) {
    console.warn('[ai-activity] listAgentRuns threw:', (err as Error).message);
    return [];
  }
}

export type TrustRow = {
  id: string;
  agentName: string;
  actionCategory: string;
  trustLevel: 'PROPOSE_ONLY' | 'AUTO_REVERSIBLE' | 'AUTO_FULL';
  isDestructive: boolean;
  approvalCount: number;
  rejectionCount: number;
  updatedAt: string | null;
};

export async function listTrustRows(tenantId: string): Promise<TrustRow[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data, error } = await admin
      .from('tenant_agent_trust')
      .select(
        'id, agent_name, action_category, trust_level, is_destructive, approval_count, rejection_count, last_recalibrated_at',
      )
      .eq('restaurant_id', tenantId);
    if (error) {
      console.warn('[ai-activity] listTrustRows:', error.message);
      return [];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((row: any) => ({
      id: String(row.id ?? ''),
      agentName: String(row.agent_name ?? ''),
      actionCategory: String(row.action_category ?? ''),
      trustLevel: (row.trust_level ?? 'PROPOSE_ONLY') as TrustRow['trustLevel'],
      isDestructive: Boolean(row.is_destructive),
      approvalCount: Number(row.approval_count ?? 0),
      rejectionCount: Number(row.rejection_count ?? 0),
      updatedAt: row.last_recalibrated_at ?? null,
    }));
  } catch (err) {
    console.warn('[ai-activity] listTrustRows threw:', (err as Error).message);
    return [];
  }
}
