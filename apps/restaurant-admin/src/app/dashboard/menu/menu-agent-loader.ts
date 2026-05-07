// Menu Agent — server-side proposal loader.
//
// IMPORTANT: This file is NOT a Server Actions module — it has no
// 'use server' directive. It can be imported only by server components
// (page.tsx) or other server-only modules. This is the explicit fix for
// Codex round-2 P1 on PR #363:
//
//   "Add tenant auth before querying proposals — Because this file is a
//   `use server` module, exported async functions are Server Actions;
//   this one uses the service-role client and trusts the caller-supplied
//   tenantId without the membership/active-tenant checks…"
//
// By moving this fetcher out of `menu-agent-actions.ts` into a non-action
// module, the function can no longer be invoked from the client (Next.js
// only marshals 'use server' exports across the Server-Action boundary).
// The page.tsx caller already verifies tenant membership via getActiveTenant
// before calling this loader — no further check is needed because the
// function is unreachable from untrusted callers.

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MenuAgentProposalRow } from '@/lib/ai/agents/menu-agent';

// Server-side fetcher used by the menu page's "Sugestii Hepy" tab. Caps at
// 50 rows — typical tenant won't accumulate more DRAFT proposals than the
// daily cap × a few days. Caller filters by status when needed.
//
// SECURITY: This function does NOT verify tenant membership of the caller.
// Callers must do that themselves BEFORE invoking. Today the only caller
// is `apps/restaurant-admin/src/app/dashboard/menu/page.tsx`, which calls
// `getActiveTenant()` first; that function bridges through Supabase auth
// + tenant_members and only resolves tenants the signed-in user can see.
export async function loadProposals(
  tenantId: string,
  opts?: { status?: 'DRAFT' | 'ACCEPTED' | 'DISMISSED'; limit?: number },
): Promise<MenuAgentProposalRow[]> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  let q = sb
    .from('menu_agent_proposals')
    .select(
      'id, tenant_id, agent_run_id, kind, status, payload, rationale, model, input_tokens, output_tokens, decided_at, decided_by, decision_note, created_at, channel',
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 50);
  if (opts?.status) q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) {
    console.warn('[menu-agent/load] query failed:', error.message);
    return [];
  }
  return (data ?? []) as MenuAgentProposalRow[];
}
