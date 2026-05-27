// Video adapter — barrel + factory.
//
// Real provider implementations: Runway Gen-3, Pika 2.5. Veo and HeyGen
// land in a future PR (Lot 7+) once we have access. Mock provider remains
// available for unit tests and local dev without API keys.

import type { Tier } from '../../types';
import type { VideoProvider, VideoProviderName } from './base';
import { MockVideoProvider } from './mock';
import { RunwayProvider, type RunwayProviderOptions } from './runway';
import { PikaProvider, type PikaProviderOptions } from './pika';

export * from './base';
export * from './mock';
export * from './runway';
export * from './pika';

/**
 * Provider options sourced from env at construction time. Pass an empty
 * object to fall back to mock-only mode (useful for tests).
 */
export interface VideoProviderRegistryOptions {
  runway?: RunwayProviderOptions;
  pika?: PikaProviderOptions;
}

/**
 * Resolve a default video provider for a given brand tier. The orchestrator
 * may override this for special formats (e.g. always HeyGen for avatar).
 *
 * When env credentials for the tier's preferred real provider are missing,
 * we fall back to mock — so dev environments keep working without keys.
 */
const TIER_PREFERRED: Record<Tier, VideoProviderName> = {
  basic: 'pika',
  pro: 'runway',
  enterprise: 'runway',  // until Veo wired
};

export function buildVideoProviderRegistry(
  opts: VideoProviderRegistryOptions = {},
): Record<VideoProviderName, () => VideoProvider> {
  // Cache provider instances per registry. Codex P2 absorb: returning
  // a fresh MockVideoProvider on every call breaks submit-then-poll —
  // VideoGenAgent.generate() recorded the job in one instance and
  // getStatus() constructed another with an empty job map, returning
  // 'unknown job id'. Real providers (Runway/Pika) are stateless on
  // the client side so sharing is benign for them too.
  let mockSingleton: MockVideoProvider | null = null;
  let runwaySingleton: RunwayProvider | null = null;
  let pikaSingleton: PikaProvider | null = null;

  return {
    mock: () => {
      if (!mockSingleton) mockSingleton = new MockVideoProvider();
      return mockSingleton;
    },
    runway: () => {
      if (!opts.runway?.apiKey) {
        throw new Error('RunwayProvider: RUNWAY_API_KEY missing — pass via buildVideoProviderRegistry({ runway: { apiKey } })');
      }
      if (!runwaySingleton) runwaySingleton = new RunwayProvider(opts.runway);
      return runwaySingleton;
    },
    pika: () => {
      if (!opts.pika?.apiKey) {
        throw new Error('PikaProvider: PIKA_API_KEY missing — pass via buildVideoProviderRegistry({ pika: { apiKey } })');
      }
      if (!pikaSingleton) pikaSingleton = new PikaProvider(opts.pika);
      return pikaSingleton;
    },
    veo: () => {
      throw new Error('VeoProvider not yet implemented');
    },
    heygen: () => {
      throw new Error('HeyGenProvider not yet implemented');
    },
  };
}

// Default registry — mock-only. Production code should call
// buildVideoProviderRegistry(envOpts) once at boot and inject via
// getVideoProvider's optional second arg.
const DEFAULT_REGISTRY = buildVideoProviderRegistry();

export function getVideoProvider(
  name: VideoProviderName,
  registry: Record<VideoProviderName, () => VideoProvider> = DEFAULT_REGISTRY,
): VideoProvider {
  const factory = registry[name];
  if (!factory) throw new Error(`getVideoProvider: unknown provider "${name}"`);
  return factory();
}

export function getDefaultVideoProvider(
  tier: Tier,
  registry: Record<VideoProviderName, () => VideoProvider> = DEFAULT_REGISTRY,
): VideoProvider {
  const preferred = TIER_PREFERRED[tier];
  try {
    return getVideoProvider(preferred, registry);
  } catch {
    // Real provider unavailable (no API key) — fall back to mock so dev/test
    // environments keep working. Production should never hit this path.
    return getVideoProvider('mock', registry);
  }
}
