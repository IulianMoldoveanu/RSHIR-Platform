// Pure helpers for the Intent Registry page.
//
// Extracted into a non-'use server' file so they can be exercised by
// vitest without rendering the React server component (which requires
// next/navigation + cookies-aware Supabase client). The page imports
// these and the test file asserts on them directly.

import {
  KNOWN_INTENTS,
  type AgentName,
  type RegistryEntry,
} from '@/lib/ai/master-orchestrator-types';

export const AGENT_FILTER_VALUES = [
  'all',
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

export type AgentFilter = (typeof AGENT_FILTER_VALUES)[number];

/** Normalize a raw `?agent=` query string against the allow-list. */
export function parseAgentFilter(raw: string | undefined): AgentFilter {
  const v = (raw ?? '').toLowerCase();
  return (AGENT_FILTER_VALUES as readonly string[]).includes(v)
    ? (v as AgentFilter)
    : 'all';
}

/** Filter the static intent list by the parsed agent filter. */
export function filterIntents(
  intents: RegistryEntry[],
  filter: AgentFilter,
): RegistryEntry[] {
  if (filter === 'all') return intents;
  return intents.filter((i) => i.agent === filter);
}

/** Sort by agent then name — stable order for table rendering + snapshots. */
export function sortIntents(intents: RegistryEntry[]): RegistryEntry[] {
  return [...intents].sort((a, b) => {
    if (a.agent !== b.agent) return a.agent.localeCompare(b.agent);
    return a.name.localeCompare(b.name);
  });
}

export type IntentStats = {
  total: number;
  readOnly: number;
  mutating: number;
  byAgent: Record<AgentName, number>;
};

/** Compute the header tiles from a list of intents. */
export function computeStats(intents: RegistryEntry[]): IntentStats {
  const byAgent: Record<string, number> = {};
  let readOnly = 0;
  for (const i of intents) {
    byAgent[i.agent] = (byAgent[i.agent] ?? 0) + 1;
    if (i.readOnly) readOnly += 1;
  }
  return {
    total: intents.length,
    readOnly,
    mutating: intents.length - readOnly,
    byAgent: byAgent as Record<AgentName, number>,
  };
}

/** Convenience for the page: filtered + sorted in one call. */
export function loadIntentsForView(filter: AgentFilter): RegistryEntry[] {
  return sortIntents(filterIntents(KNOWN_INTENTS, filter));
}
