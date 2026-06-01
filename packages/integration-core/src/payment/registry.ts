// HIR Restaurant Suite — PSP adapter registry.
//
// Mirrors `../adapters/registry.ts` for the POS side. Single source of
// truth for "given a provider key, give me the adapter". Throws on
// unknown providers so a misconfigured tenant fails loudly rather than
// silently no-op'ing.
//
// Active providers: netopia, viva. Stripe Connect excluded per
// Iulian directive 2026-05-16 — see _archived/NOTICE.md.

import type { PspAdapter, PspProviderKey } from './contract';
import { netopiaAdapter } from './netopia';
import { vivaAdapter } from './viva';

const REGISTRY: Partial<Record<PspProviderKey, PspAdapter>> = {
  netopia: netopiaAdapter,
  viva: vivaAdapter,
};

export function getPspAdapter(key: PspProviderKey): PspAdapter {
  const found = REGISTRY[key];
  if (!found) {
    throw new Error(`No PSP adapter registered for provider '${key}'`);
  }
  return found;
}

export function isPspProviderImplemented(key: PspProviderKey): boolean {
  return REGISTRY[key] !== undefined;
}
