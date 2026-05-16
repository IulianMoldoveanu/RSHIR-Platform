// KNOWN_INTENTS shape + drift assertions.
//
// Static checks over the admin-side mirror at master-orchestrator-types.ts.
// These guard against three classes of regression:
//   - rows added with empty/missing required fields,
//   - duplicate names (a real bug — two rows would silently shadow each other),
//   - an entire shipped agent (analytics, ops, cs, menu, marketing, growth,
//     master) accidentally deleted from the mirror.
//
// The cross-file drift check vs `_shared/master-orchestrator.ts` already
// lives in master-orchestrator.test.ts (it reads the Deno source as text
// and parses out KNOWN_INTENTS). We intentionally do NOT duplicate that
// here — this file is the cheap shape contract.

import { describe, expect, test } from 'vitest';
import {
  KNOWN_INTENTS,
  type AgentName,
} from './master-orchestrator-types';

const ALLOWED_AGENTS: readonly AgentName[] = [
  'master',
  'menu',
  'marketing',
  'ops',
  'cs',
  'analytics',
  'finance',
  'compliance',
  'growth',
] as const;

// Agents that have actually shipped to main and MUST keep at least one
// entry in KNOWN_INTENTS. `finance` + `compliance` are reserved namespaces
// (declared in AgentName) but have no live intents yet, so they're not in
// this set — adding them would force a false failure.
const SHIPPED_AGENTS: readonly AgentName[] = [
  'analytics',
  'ops',
  'cs',
  'menu',
  'marketing',
  'growth',
  'master',
] as const;

describe('KNOWN_INTENTS / shape', () => {
  test('every entry has a non-empty name', () => {
    for (const entry of KNOWN_INTENTS) {
      expect(entry.name).toBeTruthy();
      expect(typeof entry.name).toBe('string');
      expect(entry.name.length).toBeGreaterThan(0);
    }
  });

  test('every entry has an agent in the allowed set', () => {
    for (const entry of KNOWN_INTENTS) {
      expect(ALLOWED_AGENTS).toContain(entry.agent);
    }
  });

  test('every entry has a non-empty defaultCategory', () => {
    for (const entry of KNOWN_INTENTS) {
      expect(typeof entry.defaultCategory).toBe('string');
      expect(entry.defaultCategory.length).toBeGreaterThan(0);
    }
  });

  test('every entry has a non-empty description', () => {
    for (const entry of KNOWN_INTENTS) {
      expect(typeof entry.description).toBe('string');
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });
});

describe('KNOWN_INTENTS / uniqueness', () => {
  test('no duplicate intent names', () => {
    const names = KNOWN_INTENTS.map((i) => i.name);
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const n of names) {
      if (seen.has(n)) dupes.push(n);
      seen.add(n);
    }
    expect(dupes).toEqual([]);
    // Sanity — set size equals array length.
    expect(seen.size).toBe(names.length);
  });
});

describe('KNOWN_INTENTS / shipped-agent coverage', () => {
  test('every shipped agent has at least one intent (guards against accidental deletion)', () => {
    const agentsPresent = new Set(KNOWN_INTENTS.map((i) => i.agent));
    const missing: AgentName[] = [];
    for (const a of SHIPPED_AGENTS) {
      if (!agentsPresent.has(a)) missing.push(a);
    }
    expect(missing).toEqual([]);
  });

  test('growth + master agents (F6 closure) are wired', () => {
    // Spelled out separately so a failure points directly at the F6 PRs
    // (#520 + #524) rather than the general shipped-agent loop.
    const growthIntents = KNOWN_INTENTS.filter((i) => i.agent === 'growth');
    const masterIntents = KNOWN_INTENTS.filter((i) => i.agent === 'master');
    expect(growthIntents.length).toBeGreaterThanOrEqual(2);
    expect(masterIntents.length).toBeGreaterThanOrEqual(1);
    expect(growthIntents.map((i) => i.name).sort()).toEqual([
      'growth.recommendation_get',
      'growth.recommendations_for_tenant',
    ]);
    expect(masterIntents.map((i) => i.name)).toContain('master.list_intents');
  });
});
