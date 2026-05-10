// HIR Restaurant Suite — PSP adapter registry.
//
// Mirrors `../adapters/registry.ts` for the POS side. Single source of
// truth for "given a provider key, give me the adapter". Throws on
// unknown providers so a misconfigured tenant fails loudly rather than
// silently no-op'ing.
//
// 'viva' is registered with a stub adapter that throws VIVA_NOT_CONFIGURED
// at call time — that's intentional. The factory is wired so the moment
// commercial config lands, only `viva.ts` needs to change; routes and
// admin UI already know about the provider key.

import type { PspAdapter, PspProviderKey } from './contract';
import { netopiaAdapter } from './netopia';
import { stripeConnectAdapter } from './stripe-connect';
import { vivaAdapter } from './viva';

const REGISTRY: Record<PspProviderKey, PspAdapter> = {
  netopia: netopiaAdapter,
  stripe_connect: stripeConnectAdapter,
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
  // 'viva' is in the registry but the adapter throws — surface that
  // honestly so admin UI can grey out the picker.
  if (key === 'viva') return false;
  return REGISTRY[key] !== undefined;
}
