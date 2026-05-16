// F6 RAG retrieval — top-K similar prior agent runs for a tenant.
//
// Called by the master-orchestrator dispatcher BEFORE invoking an agent's
// plan() phase. The retrieved examples are surfaced to the agent through
// `payload.__prior` so handlers that accept a `prior: SimilarRun[]` hint
// can use them for few-shot prompting. Handlers that don't read `__prior`
// see no change in behaviour.
//
// Hard contract:
//   - Returns []  when RAG_ENABLED is false / OPENAI_API_KEY is missing.
//   - Returns []  on any retrieval error (RPC missing, network flake, etc).
//     Retrieval failure NEVER blocks dispatch.
//   - Filters by restaurant_id + state='EXECUTED' inside the RPC, so a
//     tenant can never see another tenant's runs.

import { embed, buildEmbeddingSource, isRagEnabled } from './embeddings.ts';

export type SimilarRun = {
  id: string;
  agentName: string;
  actionType: string | null;
  summary: string | null;
  payload: Record<string, unknown> | null;
  similarity: number;
  createdAt: string;
};

export type RetrieveOptions = {
  // Top K. Clamped to [1, 25] inside the RPC.
  k?: number;
  // Optional agent filter (e.g. only prior 'menu' runs when dispatching a
  // menu intent). When omitted, returns the K nearest across all agents.
  agentName?: string | null;
  // Minimum cosine similarity to keep. Defaults to 0.5 — below that the
  // example is usually noise. Set to 0 to disable filtering.
  minSimilarity?: number;
};

export async function retrieveSimilarRuns(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tenantId: string,
  intent: string,
  payload: Record<string, unknown>,
  opts: RetrieveOptions = {},
): Promise<SimilarRun[]> {
  if (!isRagEnabled()) return [];
  if (!tenantId || !intent) return [];

  const source = buildEmbeddingSource(intent, payload);
  const e = await embed(source);
  if (!e) return [];

  const k = opts.k ?? 5;
  const minSim = opts.minSimilarity ?? 0.5;

  try {
    const { data, error } = await supabase.rpc('match_agent_runs', {
      p_tenant_id: tenantId,
      p_query_embedding: e.vector,
      p_k: k,
      p_agent_name: opts.agentName ?? null,
    });
    if (error) {
      console.warn('[rag] match_agent_runs failed:', error.message);
      return [];
    }
    if (!Array.isArray(data)) return [];
    return data
      .map(mapRow)
      .filter((r): r is SimilarRun => r !== null && r.similarity >= minSim);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[rag] retrieve threw:', msg);
    return [];
  }
}

// Fire-and-forget: embed the dispatched run and UPDATE the ledger row's
// embedding column. Called by the dispatcher AFTER an EXECUTED ledger row
// is inserted. Any failure is logged + swallowed — the dispatch result
// must NEVER depend on embedding success.
export async function backfillRunEmbedding(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  runId: string,
  intent: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!isRagEnabled()) return;
  if (!runId) return;

  const source = buildEmbeddingSource(intent, payload);
  const e = await embed(source);
  if (!e) return;

  try {
    const { error } = await supabase
      .from('copilot_agent_runs')
      .update({
        embedding: e.vector,
        embedding_source: source,
        embedded_at: new Date().toISOString(),
      })
      .eq('id', runId);
    if (error) {
      console.warn('[rag] backfill update failed:', error.message);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[rag] backfill threw:', msg);
  }
}

// Pure mapper exported for unit tests — verifies the RPC row shape contract.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapRow(row: any): SimilarRun | null {
  if (!row || typeof row !== 'object') return null;
  if (typeof row.id !== 'string') return null;
  const sim = typeof row.similarity === 'number' ? row.similarity : Number(row.similarity);
  if (!Number.isFinite(sim)) return null;
  return {
    id: row.id,
    agentName: typeof row.agent_name === 'string' ? row.agent_name : '',
    actionType: typeof row.action_type === 'string' ? row.action_type : null,
    summary: typeof row.summary === 'string' ? row.summary : null,
    payload: row.payload && typeof row.payload === 'object' ? row.payload : null,
    similarity: sim,
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
  };
}
