// F6 RAG — OpenAI embeddings helper (text-embedding-3-small, 1536 dims).
//
// Used by the master-orchestrator dispatcher to embed (intent + payload) so
// future calls can retrieve top-K similar prior runs and pass them into the
// sub-agent's plan() phase.
//
// Mock-first: when OPENAI_API_KEY is absent OR RAG_ENABLED is not "true",
// embed() returns null (caller treats as no-op). This keeps CI + local dev
// fully offline. The orchestrator already swallows a null embedding (the
// UPDATE statement skips when null) so this is the kill-switch.
//
// Deno-compatible. No third-party SDK — direct fetch keeps the bundle small.

const EMBEDDING_DIM = 1536;
const MODEL = 'text-embedding-3-small';

export type EmbedResult = {
  vector: number[];
  source: string;
  model: string;
} | null;

export function isRagEnabled(): boolean {
  // Two gates so an operator can disable embeddings without unsetting the
  // OpenAI key (e.g. quota pause).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (globalThis as any).Deno?.env;
  const flag = env?.get?.('RAG_ENABLED');
  const key = env?.get?.('OPENAI_API_KEY');
  return flag === 'true' && typeof key === 'string' && key.length > 0;
}

// Deterministic mock embedding for tests. Hashes the input string into a
// stable 1536-dim unit vector. NOT cryptographically interesting — just
// stable enough that `embed("foo")` always returns the same vector and
// different inputs produce different vectors.
export function mockEmbed(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIM).fill(0);
  // Fill with cheap hash-derived values, then normalise.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    h = h >>> 0;
    v[i] = ((h % 2000) - 1000) / 1000;
  }
  // L2 normalise so cosine similarity matches dot product.
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) norm += v[i]! * v[i]!;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < EMBEDDING_DIM; i++) v[i] = v[i]! / norm;
  return v;
}

// Build the canonical embedding source string for an intent dispatch. Stable
// JSON.stringify ordering (we accept the default — sub-agents must not rely
// on key ordering for retrieval quality; it's a fuzzy signal).
export function buildEmbeddingSource(intent: string, payload: Record<string, unknown>): string {
  let payloadStr: string;
  try {
    payloadStr = JSON.stringify(payload ?? {});
  } catch {
    payloadStr = '{}';
  }
  // 4 KB cap so a runaway payload doesn't trigger an OpenAI 8K-token error.
  // The model's hard limit is 8191 tokens; 4 KB of ASCII is well under.
  if (payloadStr.length > 4096) payloadStr = payloadStr.slice(0, 4096);
  return `${intent} ${payloadStr}`;
}

export async function embed(text: string): Promise<EmbedResult> {
  if (!text || text.length === 0) return null;
  if (!isRagEnabled()) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (globalThis as any).Deno?.env;
  const apiKey = env?.get?.('OPENAI_API_KEY') as string | undefined;
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, input: text }),
    });
    if (!res.ok) {
      console.warn(`[embeddings] OpenAI ${res.status}: ${await res.text().catch(() => '')}`);
      return null;
    }
    const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    const vector = json.data?.[0]?.embedding;
    if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIM) {
      console.warn(`[embeddings] unexpected response shape (len=${vector?.length})`);
      return null;
    }
    return { vector, source: text, model: MODEL };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[embeddings] fetch threw:', msg);
    return null;
  }
}

export const __testing = { EMBEDDING_DIM, MODEL };
