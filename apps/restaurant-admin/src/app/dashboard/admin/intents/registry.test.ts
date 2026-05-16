// Tests for the Intent Registry helpers.
//
// We exercise the pure helpers (parseAgentFilter / filterIntents /
// sortIntents / computeStats / loadIntentsForView) directly instead of
// rendering the React server component — vitest is configured with a
// node environment + .test.ts-only include, and the page depends on
// next/navigation + cookies-aware Supabase client.

import { describe, expect, it } from 'vitest';
import { KNOWN_INTENTS } from '@/lib/ai/master-orchestrator-types';
import {
  AGENT_FILTER_VALUES,
  computeStats,
  filterIntents,
  loadIntentsForView,
  parseAgentFilter,
  sortIntents,
} from './registry';

describe('Intent Registry helpers', () => {
  it('renders every intent from KNOWN_INTENTS by default (all filter)', () => {
    const rows = loadIntentsForView('all');
    // Count assertion — every KNOWN_INTENTS row reaches the view.
    expect(rows).toHaveLength(KNOWN_INTENTS.length);
    // Sanity floor — F6 closure shipped at least 20+ intents.
    expect(rows.length).toBeGreaterThanOrEqual(20);
  });

  it('filter by agent=cs reduces rows to cs intents only', () => {
    const rows = loadIntentsForView('cs');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.agent).toBe('cs');
    }
    // And the count matches the underlying registry.
    const expected = KNOWN_INTENTS.filter((i) => i.agent === 'cs').length;
    expect(rows).toHaveLength(expected);
  });

  it('locks the displayed shape of master.list_intents (F6 meta-handler)', () => {
    const rows = loadIntentsForView('master');
    const masterListIntents = rows.find((r) => r.name === 'master.list_intents');
    expect(masterListIntents).toMatchInlineSnapshot(`
      {
        "agent": "master",
        "defaultCategory": "master.read",
        "description": "Listează intent-urile înregistrate (filtrabil pe agent + readOnly).",
        "name": "master.list_intents",
        "readOnly": true,
      }
    `);
  });

  it('parseAgentFilter falls back to "all" for unknown / missing values', () => {
    expect(parseAgentFilter(undefined)).toBe('all');
    expect(parseAgentFilter('')).toBe('all');
    expect(parseAgentFilter('NOT_AN_AGENT')).toBe('all');
    expect(parseAgentFilter('cs')).toBe('cs');
    // Case-insensitive — URL query strings can be uppercased by hand.
    expect(parseAgentFilter('CS')).toBe('cs');
  });

  it('sortIntents orders by agent then name (stable for snapshots)', () => {
    const sorted = sortIntents([
      { name: 'cs.reservation_create', agent: 'cs', defaultCategory: 'x', description: '' },
      { name: 'analytics.summary', agent: 'analytics', defaultCategory: 'x', description: '' },
      { name: 'cs.reservation_cancel', agent: 'cs', defaultCategory: 'x', description: '' },
    ]);
    expect(sorted.map((r) => r.name)).toEqual([
      'analytics.summary',
      'cs.reservation_cancel',
      'cs.reservation_create',
    ]);
  });

  it('computeStats counts total / readOnly / mutating / byAgent correctly', () => {
    const stats = computeStats(KNOWN_INTENTS);
    expect(stats.total).toBe(KNOWN_INTENTS.length);
    expect(stats.readOnly + stats.mutating).toBe(stats.total);
    // The master agent owns exactly one intent today: master.list_intents.
    expect(stats.byAgent.master).toBe(1);
    // Sum of per-agent counts equals total.
    const sum = Object.values(stats.byAgent).reduce((a, b) => a + b, 0);
    expect(sum).toBe(stats.total);
  });

  it('filterIntents with "all" returns the input unchanged in count', () => {
    expect(filterIntents(KNOWN_INTENTS, 'all')).toHaveLength(KNOWN_INTENTS.length);
  });

  it('AGENT_FILTER_VALUES covers every known agent', () => {
    const agentsInUse = new Set(KNOWN_INTENTS.map((i) => i.agent));
    for (const agent of agentsInUse) {
      expect(AGENT_FILTER_VALUES).toContain(agent);
    }
  });
});
