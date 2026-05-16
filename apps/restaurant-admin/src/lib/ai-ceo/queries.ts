// Server-only read helpers for the AI CEO dashboard surface.
//
// The copilot tables (`copilot_threads`, `copilot_agent_runs`,
// `copilot_tenant_facts`, …) live on prod Supabase but are NOT in the generated
// `Database` types yet — the bot's edge functions own that schema and we
// don't want to couple the admin app to its migration cadence. So we cast to
// `any` and degrade gracefully (return null / [] and log) if a table or
// column has moved. The page must render even when every query fails.

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export type CopilotThread = {
  id: string;
  restaurant_id: string;
  telegram_chat_id: string | number | null;
  title: string | null;
  last_message_at: string | null;
  created_at: string | null;
};

export type CopilotAgentRun = {
  id: string;
  agent_name: string | null;
  summary: string | null;
  status: string | null;
  created_at: string | null;
};

export type CopilotTenantFact = {
  id: string;
  fact_key: string | null;
  fact_value: string | null;
  updated_at: string | null;
};

export type CopilotBriefSchedule = {
  enabled: boolean;
  delivery_hour_local: number;
  last_sent_at: string | null;
  consecutive_skips: number;
};

export type CopilotSuggestion = {
  runId: string;
  index: number;
  type: string;
  title: string;
  status: string;
  createdAt: string | null;
};

export type CopilotAutoAction = {
  runId: string;
  kind: string;
  summary: string | null;
  at: string | null;
};

export async function getThreadForTenant(tenantId: string): Promise<CopilotThread | null> {
  try {
    const admin = createAdminClient() as any;
    const { data, error } = await admin
      .from('copilot_threads')
      .select('id, restaurant_id, telegram_chat_id, title, last_message_at, created_at')
      .eq('restaurant_id', tenantId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn('[ai-ceo/queries] getThreadForTenant:', error.message);
      return null;
    }
    return (data as CopilotThread | null) ?? null;
  } catch (err) {
    console.warn('[ai-ceo/queries] getThreadForTenant threw:', (err as Error).message);
    return null;
  }
}

export async function getRecentAgentRuns(
  tenantId: string,
  days: number,
): Promise<CopilotAgentRun[]> {
  try {
    const admin = createAdminClient() as any;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    // We don't know the exact column names; ask for `*` and project on the
    // client. If the table doesn't exist or the tenant filter column has a
    // different name, the query errors and we return [].
    const { data, error } = await admin
      .from('copilot_agent_runs')
      .select('*')
      .eq('restaurant_id', tenantId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(25);
    if (error) {
      console.warn('[ai-ceo/queries] getRecentAgentRuns:', error.message);
      return [];
    }
    return (data ?? []).map((row: any) => ({
      id: String(row.id ?? ''),
      agent_name: row.agent_name ?? row.agent ?? row.name ?? null,
      summary:
        row.summary ??
        row.output_summary ??
        (typeof row.metadata === 'object' && row.metadata !== null
          ? row.metadata.summary ?? null
          : null) ??
        (typeof row.output === 'string' ? row.output : null),
      status: row.status ?? null,
      created_at: row.created_at ?? null,
    }));
  } catch (err) {
    console.warn('[ai-ceo/queries] getRecentAgentRuns threw:', (err as Error).message);
    return [];
  }
}

export async function getBriefSchedule(tenantId: string): Promise<CopilotBriefSchedule | null> {
  try {
    const admin = createAdminClient() as any;
    const { data, error } = await admin
      .from('copilot_brief_schedules')
      .select('enabled, delivery_hour_local, last_sent_at, consecutive_skips')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) {
      console.warn('[ai-ceo/queries] getBriefSchedule:', error.message);
      return null;
    }
    if (!data) return null;
    return {
      enabled: Boolean(data.enabled),
      delivery_hour_local: Number(data.delivery_hour_local ?? 8),
      last_sent_at: data.last_sent_at ?? null,
      consecutive_skips: Number(data.consecutive_skips ?? 0),
    };
  } catch (err) {
    console.warn('[ai-ceo/queries] getBriefSchedule threw:', (err as Error).message);
    return null;
  }
}

// Pulls the most recent daily-brief run with suggestions and projects them
// alongside the parallel suggestion_status[] array. Capped at 5 (the brief
// itself only ever generates 3, but a future weekly digest may add more).
// Schema lives in the bot's domain — same any-cast + best-effort pattern as
// the other readers.
export async function getLatestSuggestions(
  tenantId: string,
): Promise<CopilotSuggestion[]> {
  try {
    const admin = createAdminClient() as any;
    const { data, error } = await admin
      .from('copilot_agent_runs')
      .select('id, created_at, metadata, suggestion_status')
      .eq('restaurant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) {
      console.warn('[ai-ceo/queries] getLatestSuggestions:', error.message);
      return [];
    }
    // Find the most recent run that actually carried suggestions.
    const run = (data ?? []).find((row: any) => {
      const meta = row?.metadata;
      return (
        meta &&
        typeof meta === 'object' &&
        meta.kind === 'daily_brief' &&
        Array.isArray(meta.suggestions) &&
        meta.suggestions.length > 0
      );
    });
    if (!run) return [];
    const suggestions = (run.metadata?.suggestions ?? []) as Array<{
      id?: string;
      type?: string;
      title?: string;
    }>;
    const status = Array.isArray(run.suggestion_status) ? run.suggestion_status : [];
    return suggestions.slice(0, 5).map((s, i) => ({
      runId: String(run.id ?? ''),
      index: i,
      type: String(s.type ?? 'unknown'),
      title: String(s.title ?? s.id ?? '(fără titlu)'),
      status: String(status[i] ?? 'pending'),
      createdAt: run.created_at ?? null,
    }));
  } catch (err) {
    console.warn('[ai-ceo/queries] getLatestSuggestions threw:', (err as Error).message);
    return [];
  }
}

// Pulls auto-executed actions (the "what did the bot actually do" feed) from
// the last `days` days of agent runs. The bot's domain owns the jsonb shape;
// we defensively project { kind, summary, at } and skip rows where no
// actions were executed. Empty result is normal until the bot learns to
// auto-execute — the section degrades to "Botul nu a executat acțiuni încă".
export async function getAutoExecutedActions(
  tenantId: string,
  days: number,
): Promise<CopilotAutoAction[]> {
  try {
    const admin = createAdminClient() as any;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await admin
      .from('copilot_agent_runs')
      .select('id, created_at, auto_executed_actions')
      .eq('restaurant_id', tenantId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      console.warn('[ai-ceo/queries] getAutoExecutedActions:', error.message);
      return [];
    }
    const out: CopilotAutoAction[] = [];
    for (const row of data ?? []) {
      const actions = Array.isArray(row?.auto_executed_actions)
        ? row.auto_executed_actions
        : [];
      for (const a of actions) {
        if (a && typeof a === 'object') {
          const obj = a as Record<string, unknown>;
          out.push({
            runId: String(row.id ?? ''),
            kind: String(obj.kind ?? obj.type ?? 'action'),
            summary:
              typeof obj.summary === 'string'
                ? obj.summary
                : typeof obj.title === 'string'
                  ? obj.title
                  : null,
            at:
              typeof obj.at === 'string'
                ? obj.at
                : typeof obj.executed_at === 'string'
                  ? obj.executed_at
                  : (row.created_at ?? null),
          });
        }
      }
    }
    // Newest first, capped to a sensible number for the timeline view.
    out.sort((a, b) => {
      const ta = a.at ? new Date(a.at).getTime() : 0;
      const tb = b.at ? new Date(b.at).getTime() : 0;
      return tb - ta;
    });
    return out.slice(0, 25);
  } catch (err) {
    console.warn(
      '[ai-ceo/queries] getAutoExecutedActions threw:',
      (err as Error).message,
    );
    return [];
  }
}

export type GrowthRecommendation = {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  title_ro: string;
  suggested_action_ro: string;
  rationale_ro: string | null;
  generated_at: string | null;
  status: string;
};

export type GrowthRecommendationCounters = {
  pending: number;
  approved30d: number;
  dismissed30d: number;
};

// Pulls the top-N pending growth recommendations for a tenant, newest first
// (ordered by generated_at desc as a tie-breaker after priority). The table
// is owned by the F6 growth-agent migration (20260504_006_growth_agent.sql)
// — same any-cast pattern as the copilot tables to avoid coupling the admin
// app's typecheck to the bot's type-gen cadence.
export async function getPendingGrowthRecommendations(
  tenantId: string,
  limit = 10,
): Promise<GrowthRecommendation[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data, error } = await admin
      .from('growth_recommendations')
      .select(
        'id, priority, category, title_ro, suggested_action_ro, rationale_ro, generated_at, status',
      )
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .order('generated_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.warn('[ai-ceo/queries] getPendingGrowthRecommendations:', error.message);
      return [];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((row: any) => ({
      id: String(row.id ?? ''),
      priority: (row.priority ?? 'medium') as GrowthRecommendation['priority'],
      category: String(row.category ?? ''),
      title_ro: String(row.title_ro ?? ''),
      suggested_action_ro: String(row.suggested_action_ro ?? ''),
      rationale_ro: row.rationale_ro ?? null,
      generated_at: row.generated_at ?? null,
      status: String(row.status ?? 'pending'),
    }));
  } catch (err) {
    console.warn(
      '[ai-ceo/queries] getPendingGrowthRecommendations threw:',
      (err as Error).message,
    );
    return [];
  }
}

// Counters for the section header. Pending = all-time pending; approved /
// dismissed are scoped to the last 30 days so the badges reflect "recent
// activity" rather than lifetime totals.
export async function getGrowthRecommendationCounters(
  tenantId: string,
): Promise<GrowthRecommendationCounters> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [pending, approved, dismissed] = await Promise.all([
      admin
        .from('growth_recommendations')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'pending'),
      admin
        .from('growth_recommendations')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'approved')
        .gte('decided_at', since30d),
      admin
        .from('growth_recommendations')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'dismissed')
        .gte('decided_at', since30d),
    ]);
    return {
      pending: Number(pending?.count ?? 0),
      approved30d: Number(approved?.count ?? 0),
      dismissed30d: Number(dismissed?.count ?? 0),
    };
  } catch (err) {
    console.warn(
      '[ai-ceo/queries] getGrowthRecommendationCounters threw:',
      (err as Error).message,
    );
    return { pending: 0, approved30d: 0, dismissed30d: 0 };
  }
}

export type AgentCostSummary = {
  totalCents7d: number;
  totalCents30d: number;
  callCount30d: number;
  byAgent: Array<{
    agent: string;
    cents30d: number;
    calls30d: number;
  }>;
};

// Aggregates per-tenant Anthropic spend from `agent_cost_ledger` (F6 cost
// ledger). Pulls the last 30 days of rows in one read (this table is
// indexed on (tenant_id, created_at desc)) and computes 7d + 30d totals +
// a per-agent breakdown in memory. Avoids running 3 separate aggregated
// queries against the same window.
//
// Returns zero-valued summary on read failure so the calling page never
// renders an error state — the widget is purely informational.
export async function getAgentCostSummary(tenantId: string): Promise<AgentCostSummary> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const { data, error } = await admin
      .from('agent_cost_ledger')
      .select('agent_name, cost_cents, created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', since30d.toISOString())
      .order('created_at', { ascending: false })
      .limit(10000); // hard ceiling — should never hit this in practice
    if (error) {
      console.warn('[ai-ceo/queries] getAgentCostSummary read failed:', error.message);
      return { totalCents7d: 0, totalCents30d: 0, callCount30d: 0, byAgent: [] };
    }
    const rows = (data ?? []) as Array<{
      agent_name: string;
      cost_cents: number | string;
      created_at: string;
    }>;
    let totalCents7d = 0;
    let totalCents30d = 0;
    const byAgentMap = new Map<string, { cents: number; calls: number }>();
    const since7dMs = since7d.getTime();
    for (const r of rows) {
      const cents = Number(r.cost_cents ?? 0);
      totalCents30d += cents;
      if (new Date(r.created_at).getTime() >= since7dMs) {
        totalCents7d += cents;
      }
      const cur = byAgentMap.get(r.agent_name) ?? { cents: 0, calls: 0 };
      cur.cents += cents;
      cur.calls += 1;
      byAgentMap.set(r.agent_name, cur);
    }
    const byAgent = Array.from(byAgentMap.entries())
      .map(([agent, v]) => ({ agent, cents30d: v.cents, calls30d: v.calls }))
      .sort((a, b) => b.cents30d - a.cents30d);
    return {
      totalCents7d,
      totalCents30d,
      callCount30d: rows.length,
      byAgent,
    };
  } catch (err) {
    console.warn(
      '[ai-ceo/queries] getAgentCostSummary threw:',
      (err as Error).message,
    );
    return { totalCents7d: 0, totalCents30d: 0, callCount30d: 0, byAgent: [] };
  }
}

export async function getTenantFacts(tenantId: string): Promise<CopilotTenantFact[]> {
  try {
    const admin = createAdminClient() as any;
    const { data, error } = await admin
      .from('copilot_tenant_facts')
      .select('*')
      .eq('restaurant_id', tenantId)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(50);
    if (error) {
      console.warn('[ai-ceo/queries] getTenantFacts:', error.message);
      return [];
    }
    return (data ?? []).map((row: any) => ({
      id: String(row.id ?? ''),
      fact_key: row.fact_key ?? row.key ?? null,
      fact_value:
        typeof row.fact_value === 'string'
          ? row.fact_value
          : row.fact_value != null
            ? JSON.stringify(row.fact_value)
            : (row.value ?? null),
      updated_at: row.updated_at ?? row.last_updated_at ?? null,
    }));
  } catch (err) {
    console.warn('[ai-ceo/queries] getTenantFacts threw:', (err as Error).message);
    return [];
  }
}
