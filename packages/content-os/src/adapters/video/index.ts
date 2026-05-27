// Video adapter — barrel + factory.
//
// Real provider implementations (runway.ts, pika.ts, veo.ts, heygen.ts)
// land in a follow-up PR (Lot 5) once we have API credentials. For now
// only `mock` is wired so the orchestrator and tests can run end-to-end.

import type { Tier } from '../../types';
import type { VideoProvider, VideoProviderName } from './base';
import { MockVideoProvider } from './mock';

export * from './base';
export * from './mock';

/**
 * Resolve a default video provider for a given brand tier. The orchestrator
 * may override this for special formats (e.g. always HeyGen for avatar).
 */
const TIER_DEFAULT: Record<Tier, VideoProviderName> = {
  basic: 'mock',       // → 'pika' once Lot 5 adds the real adapter
  pro: 'mock',         // → 'runway'
  enterprise: 'mock',  // → 'veo'
};

const REGISTRY: Record<VideoProviderName, () => VideoProvider> = {
  mock: () => new MockVideoProvider(),
  // The following throw until Lot 5 wires real implementations.
  runway: () => {
    throw new Error('RunwayProvider not yet implemented (Lot 5)');
  },
  pika: () => {
    throw new Error('PikaProvider not yet implemented (Lot 5)');
  },
  veo: () => {
    throw new Error('VeoProvider not yet implemented (Lot 5)');
  },
  heygen: () => {
    throw new Error('HeyGenProvider not yet implemented (Lot 5)');
  },
};

export function getVideoProvider(name: VideoProviderName): VideoProvider {
  const factory = REGISTRY[name];
  if (!factory) throw new Error(`getVideoProvider: unknown provider "${name}"`);
  return factory();
}

export function getDefaultVideoProvider(tier: Tier): VideoProvider {
  return getVideoProvider(TIER_DEFAULT[tier]);
}
