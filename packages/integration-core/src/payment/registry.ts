// HIR Restaurant Suite — PSP adapter registry.
//
// Mirrors `../adapters/registry.ts` for the POS side. Single source of
// truth for "given a provider key, give me the adapter". Throws on
// unknown providers so a misconfigured tenant fails loudly rather than
// silently no-op'ing.
//
// Iulian directive 2026-05-16: Stripe Connect is excluded from the active
// payment path. The adapter file is preserved for historic reference, but
// it is no longer registered here — `getPspAdapter('stripe_connect')` now
// throws the same "unknown provider" error a typo would. Callers must
// migrate to 'netopia' or 'viva'.

import type { PspAdapter, PspProviderKey } from './contract';
import { netopiaAdapter } from './netopia';
import { vivaAdapter } from './viva';

// 'stripe_connect' intentionally absent — see header note. The provider
// key remains in the union type for compile-time compatibility with any
// historic tenant rows; runtime lookup throws.
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
  // 'stripe_connect' is deliberately unregistered. 'netopia' + 'viva' both
  // expose a sandbox-mode helper at the storefront's createCheckoutSession
  // boundary; live mode is still gated on commercial config.
  return REGISTRY[key] !== undefined;
}
