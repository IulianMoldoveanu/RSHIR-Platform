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
