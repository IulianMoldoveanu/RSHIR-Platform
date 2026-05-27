import type { IntegrationAdapter, ProviderKey } from '../contract';
import { mockAdapter } from './mock';
import { freyaAdapter } from './freya';
import { posnetAdapter } from './posnet';
import { iikoAdapter } from './iiko';
import { customAdapter } from './custom';
import { smartcashAdapter } from './smartcash';

const REGISTRY: Partial<Record<ProviderKey, IntegrationAdapter>> = {
  mock: mockAdapter,
  freya: freyaAdapter,
  posnet: posnetAdapter,
  iiko: iikoAdapter,
  smartcash: smartcashAdapter,
  custom: customAdapter,
  // Throwing on unknown keys is intentional; a tenant configured with an
  // unimplemented provider should fail loudly so the operator notices.
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
