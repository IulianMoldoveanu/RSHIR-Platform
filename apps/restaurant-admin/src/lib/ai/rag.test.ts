// F6 RAG — unit tests for the embedder + retrieval helpers.
//
// Imports the canonical Deno-side files directly. Vitest runs in Node;
// the modules use `globalThis.Deno?.env` so absence of Deno globals is a
// supported code path (returns null / [] — the mock-mode contract).

import { describe, expect, test, beforeEach, vi, afterEach } from 'vitest';

import {
  embed,
  mockEmbed,
  buildEmbeddingSource,
  isRagEnabled,
  __testing,
} from '../../../../../supabase/functions/_shared/embeddings';
import {
  retrieveSimilarRuns,
  backfillRunEmbedding,
  mapRow,
} from '../../../../../supabase/functions/_shared/master-orchestrator-rag';

describe('embeddings — mock mode', () => {
  test('isRagEnabled returns false when no Deno env', () => {
    // Node runtime has no globalThis.Deno; gate must be closed.
    expect(isRagEnabled()).toBe(false);
  });

  test('embed returns null when RAG disabled', async () => {
    const r = await embed('hello world');
    expect(r).toBeNull();
  });

  test('embed returns null on empty input', async () => {
    expect(await embed('')).toBeNull();
  });

  test('mockEmbed returns 1536-dim unit vector', () => {
    const v = mockEmbed('analytics.summary {}');
    expect(v).toHaveLength(__testing.EMBEDDING_DIM);
    let norm = 0;
    for (const x of v) norm += x * x;
    expect(Math.sqrt(norm)).toBeCloseTo(1, 4);
  });

  test('mockEmbed is deterministic for same input', () => {
    expect(mockEmbed('foo')).toEqual(mockEmbed('foo'));
  });

  test('mockEmbed differs for different inputs', () => {
    const a = mockEmbed('foo');
    const b = mockEmbed('bar');
    // Vectors should not be byte-identical.
    expect(a).not.toEqual(b);
  });
});

describe('buildEmbeddingSource', () => {
  test('combines intent + JSON payload', () => {
    const s = buildEmbeddingSource('menu.price_change', { product_id: 'abc', new_price: 25 });
    expect(s.startsWith('menu.price_change ')).toBe(true);
    expect(s).toContain('product_id');
    expect(s).toContain('25');
  });

  test('handles empty payload', () => {
    const s = buildEmbeddingSource('analytics.summary', {});
    expect(s).toBe('analytics.summary {}');
  });

  test('caps oversized payloads at 4096 chars of JSON', () => {
    const big = { blob: 'x'.repeat(10_000) };
    const s = buildEmbeddingSource('test', big);
    // intent + space + at most 4096 chars of JSON
    expect(s.length).toBeLessThanOrEqual('test '.length + 4096);
  });

  test('survives unserialisable payload', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const s = buildEmbeddingSource('boom', circular);
    expect(s).toBe('boom {}');
  });
});

describe('retrieveSimilarRuns', () => {
  test('returns [] when RAG disabled (no Deno env)', async () => {
    const supabase = {
      rpc: vi.fn(),
    };
    const r = await retrieveSimilarRuns(supabase, 'tenant-1', 'menu.update', { foo: 'bar' });
    expect(r).toEqual([]);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  test('returns [] when tenantId missing', async () => {
    const supabase = { rpc: vi.fn() };
    expect(await retrieveSimilarRuns(supabase, '', 'menu.update', {})).toEqual([]);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  test('returns [] when intent missing', async () => {
    const supabase = { rpc: vi.fn() };
    expect(await retrieveSimilarRuns(supabase, 't-1', '', {})).toEqual([]);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe('backfillRunEmbedding', () => {
  test('no-op when RAG disabled', async () => {
    const update = vi.fn();
    const supabase = {
      from: vi.fn(() => ({ update: (..._args: unknown[]) => { update(...(_args as [])); return { eq: vi.fn() }; } })),
    };
    await backfillRunEmbedding(supabase, 'run-1', 'menu.update', {});
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('no-op when runId is empty', async () => {
    const supabase = { from: vi.fn() };
    await backfillRunEmbedding(supabase, '', 'menu.update', {});
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('mapRow — RPC row mapper', () => {
  test('maps a well-formed row', () => {
    const r = mapRow({
      id: 'run-1',
      agent_name: 'menu',
      action_type: 'menu.price.change',
      summary: 'Schimbat preț la x',
      payload: { product_id: 'p1' },
      similarity: 0.82,
      created_at: '2026-05-15T10:00:00Z',
    });
    expect(r).not.toBeNull();
    expect(r!.id).toBe('run-1');
    expect(r!.agentName).toBe('menu');
    expect(r!.similarity).toBeCloseTo(0.82);
    expect(r!.payload).toEqual({ product_id: 'p1' });
  });

  test('returns null on missing id', () => {
    expect(mapRow({ similarity: 0.5 })).toBeNull();
  });

  test('returns null on non-numeric similarity', () => {
    expect(mapRow({ id: 'x', similarity: 'nope' })).toBeNull();
  });

  test('coerces similarity string to number', () => {
    const r = mapRow({ id: 'x', similarity: '0.7', agent_name: 'menu', created_at: 'now' });
    expect(r).not.toBeNull();
    expect(r!.similarity).toBeCloseTo(0.7);
  });

  test('handles null payload + summary defensively', () => {
    const r = mapRow({
      id: 'x',
      agent_name: 'menu',
      action_type: null,
      summary: null,
      payload: null,
      similarity: 0.6,
      created_at: 'now',
    });
    expect(r).not.toBeNull();
    expect(r!.payload).toBeNull();
    expect(r!.summary).toBeNull();
    expect(r!.actionType).toBeNull();
  });
});

describe('retrieveSimilarRuns — RAG enabled fake', () => {
  // Stub Deno.env to simulate enabled gate, but stub `embed` indirectly by
  // poisoning fetch so the real embed() returns null. The point of this
  // suite is to assert that retrieve returns [] on embed failure rather
  // than throwing — i.e. the safety contract holds end-to-end.
  let originalDeno: unknown;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    originalDeno = (globalThis as any).Deno;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Deno = {
      env: {
        get: (k: string) => {
          if (k === 'RAG_ENABLED') return 'true';
          if (k === 'OPENAI_API_KEY') return 'sk-test';
          return undefined;
        },
      },
    };
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response('boom', { status: 500 })) as typeof globalThis.fetch;
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Deno = originalDeno;
    globalThis.fetch = originalFetch;
  });

  test('returns [] when OpenAI API errors', async () => {
    const supabase = { rpc: vi.fn() };
    const r = await retrieveSimilarRuns(supabase, 'tenant-1', 'menu.update', { x: 1 });
    expect(r).toEqual([]);
    // embed() returned null → we short-circuit before rpc().
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  test('gate flips with isRagEnabled', () => {
    expect(isRagEnabled()).toBe(true);
  });
});
