import type { IntegrationAdapter, ProviderKey } from '../contract';
import { mockAdapter } from './mock';

const REGISTRY: Partial<Record<ProviderKey, IntegrationAdapter>> = {
  mock: mockAdapter,
  // Future: iiko, smartcash, freya, posnet, custom — register here as
  // adapters are implemented. Throwing on unknown keys is intentional;
  // a tenant configured with an unimplemented provider should fail loudly
  // so the operator notices.
};

export function getAdapter(key: ProviderKey): IntegrationAdapter {
  const found = REGISTRY[key];
  if (!found) {
    throw new Error(`No integration adapter registered for provider '${key}'`);
  }
  return found;
}

export function isProviderImplemented(key: ProviderKey): boolean {
  return REGISTRY[key] !== undefined;
}
