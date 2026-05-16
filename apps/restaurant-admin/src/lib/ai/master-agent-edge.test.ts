// Master Agent (Deno-side meta-handler) — unit tests for F6 closure.
//
// Verifies the single read intent `master.list_intents` that reflects the
// live REGISTRY back to callers. We register a small set of dummy
// intents (mixed agents, mixed readOnly) to exercise the filter logic
// without depending on which sub-agents happen to be wired in the
// process at test time.
//
// Coverage map:
//   1. Registration — master.list_intents is registered under agent=master
//      with readOnly:true and category=master.read.
//   2. No filter returns ALL registered intents.
//   3. agent filter narrows correctly.
//   4. readOnly:true filter narrows correctly.
//   5. agent + readOnly combined intersect correctly.
//   6. The handler field is stripped from returned items.
//
// Placement deviation: same as cs-agent-edge.test.ts — vitest only globs
// `apps/restaurant-admin/src/**/*.test.ts`.

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  clearRegistryForTesting,
  listIntents,
  registerIntent,
  type IntentHandler,
  type IntentRegistration,
} from '../../../../../supabase/functions/_shared/master-orchestrator';
import {
  registerMasterIntents,
  __resetMasterRegisteredForTesting,
} from '../../../../../supabase/functions/_shared/master-agent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// A no-op handler — list_intents itself does not invoke other handlers.
const noopHandler: IntentHandler = {
  plan: async () => ({ actionCategory: 'noop', summary: 'noop' }),
  execute: async () => ({ summary: 'noop', data: {} }),
};

function registerDummies() {
  // Two read intents under analytics + cs.
  registerIntent({
    name: 'analytics.dummy_read',
    agent: 'analytics',
    defaultCategory: 'analytics.read',
    description: 'dummy analytics read',
    readOnly: true,
    handler: noopHandler,
  });
  registerIntent({
    name: 'cs.dummy_read',
    agent: 'cs',
    defaultCategory: 'reservation.read',
    description: 'dummy cs read',
    readOnly: true,
    handler: noopHandler,
  });
  // One write intent under cs.
  registerIntent({
    name: 'cs.dummy_write',
    agent: 'cs',
    defaultCategory: 'reservation.create',
    description: 'dummy cs write',
    // readOnly omitted → falsy.
    handler: noopHandler,
  });
  // One write intent under menu.
  registerIntent({
    name: 'menu.dummy_write',
    agent: 'menu',
    defaultCategory: 'price.change',
    description: 'dummy menu write',
    handler: noopHandler,
  });
}

function getListIntentsHandler(): IntentRegistration {
  const reg = listIntents().find((r) => r.name === 'master.list_intents');
  if (!reg) throw new Error('master.list_intents not registered');
  return reg;
}

const ctx = {
  tenantId: 't1',
  channel: 'web' as const,
  actorUserId: null,
  // master.list_intents never touches supabase; pass an empty stub.
  supabase: {},
};

// ---------------------------------------------------------------------------

beforeEach(() => {
  clearRegistryForTesting();
  __resetMasterRegisteredForTesting();
});

afterEach(() => {
  clearRegistryForTesting();
  __resetMasterRegisteredForTesting();
});

// ---------------------------------------------------------------------------
// 1. Registration
// ---------------------------------------------------------------------------

describe('master-agent / registration', () => {
  test('registers master.list_intents idempotently under agent=master', () => {
    registerMasterIntents();
    registerMasterIntents(); // dedup guard
    const reg = listIntents().find((i) => i.name === 'master.list_intents');
    expect(reg).toBeTruthy();
    expect(reg?.agent).toBe('master');
    expect(reg?.defaultCategory).toBe('master.read');
    expect(reg?.readOnly).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. master.list_intents — filter behaviour
// ---------------------------------------------------------------------------

describe('master.list_intents', () => {
  test('no filter returns ALL registered intents', async () => {
    registerMasterIntents();
    registerDummies();
    const reg = getListIntentsHandler();
    const plan = await reg.handler.plan(ctx, {});
    const result = await reg.handler.execute(ctx, plan);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    // 4 dummies + 1 master.list_intents itself = 5.
    expect(data.count).toBe(5);
    const names = data.intents.map((i: { name: string }) => i.name).sort();
    expect(names).toEqual([
      'analytics.dummy_read',
      'cs.dummy_read',
      'cs.dummy_write',
      'master.list_intents',
      'menu.dummy_write',
    ]);
  });

  test('filter by agent narrows correctly', async () => {
    registerMasterIntents();
    registerDummies();
    const reg = getListIntentsHandler();
    const plan = await reg.handler.plan(ctx, { agent: 'cs' });
    const result = await reg.handler.execute(ctx, plan);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    expect(data.count).toBe(2);
    const names = data.intents.map((i: { name: string }) => i.name).sort();
    expect(names).toEqual(['cs.dummy_read', 'cs.dummy_write']);
    for (const i of data.intents) {
      expect(i.agent).toBe('cs');
    }
  });

  test('filter by readOnly:true narrows to read-only intents', async () => {
    registerMasterIntents();
    registerDummies();
    const reg = getListIntentsHandler();
    const plan = await reg.handler.plan(ctx, { readOnly: true });
    const result = await reg.handler.execute(ctx, plan);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    const names = data.intents.map((i: { name: string }) => i.name).sort();
    // analytics.dummy_read + cs.dummy_read + master.list_intents = 3.
    expect(names).toEqual([
      'analytics.dummy_read',
      'cs.dummy_read',
      'master.list_intents',
    ]);
    for (const i of data.intents) {
      expect(i.readOnly).toBe(true);
    }
  });

  test('filter by readOnly:false narrows to write intents', async () => {
    registerMasterIntents();
    registerDummies();
    const reg = getListIntentsHandler();
    const plan = await reg.handler.plan(ctx, { readOnly: false });
    const result = await reg.handler.execute(ctx, plan);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    const names = data.intents.map((i: { name: string }) => i.name).sort();
    expect(names).toEqual(['cs.dummy_write', 'menu.dummy_write']);
    for (const i of data.intents) {
      expect(i.readOnly).toBe(false);
    }
  });

  test('agent + readOnly combined intersect correctly', async () => {
    registerMasterIntents();
    registerDummies();
    const reg = getListIntentsHandler();
    const plan = await reg.handler.plan(ctx, { agent: 'cs', readOnly: true });
    const result = await reg.handler.execute(ctx, plan);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    expect(data.count).toBe(1);
    expect(data.intents[0].name).toBe('cs.dummy_read');
  });

  test('unknown agent filter falls back to no filter (returns all)', async () => {
    registerMasterIntents();
    registerDummies();
    const reg = getListIntentsHandler();
    // asAgentFilter returns null for unknown strings → handler treats as no filter.
    const plan = await reg.handler.plan(ctx, { agent: 'nonexistent-agent' });
    const result = await reg.handler.execute(ctx, plan);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    expect(data.count).toBe(5);
  });

  test('returned items strip the handler field', async () => {
    registerMasterIntents();
    registerDummies();
    const reg = getListIntentsHandler();
    const plan = await reg.handler.plan(ctx, {});
    const result = await reg.handler.execute(ctx, plan);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    for (const i of data.intents) {
      expect(i).not.toHaveProperty('handler');
      // Public shape — every field present, all primitives.
      expect(typeof i.name).toBe('string');
      expect(typeof i.agent).toBe('string');
      expect(typeof i.defaultCategory).toBe('string');
      expect(typeof i.description).toBe('string');
      expect(typeof i.readOnly).toBe('boolean');
    }
  });
});
