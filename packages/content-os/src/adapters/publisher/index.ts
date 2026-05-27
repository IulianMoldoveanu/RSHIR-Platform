// Publisher adapter — barrel + factory.

import type { PublishChannel } from '../../types';
import type { PublisherProvider } from './base';
import { FacebookProvider, InstagramProvider } from './meta';
import { TikTokProvider } from './tiktok';
import { LinkedInProvider } from './linkedin';
import { XProvider } from './x';

export * from './base';
export * from './meta';
export * from './tiktok';
export * from './linkedin';
export * from './x';

const REGISTRY: Record<PublishChannel, () => PublisherProvider> = {
  facebook: () => new FacebookProvider(),
  instagram: () => new InstagramProvider(),
  tiktok: () => new TikTokProvider(),
  linkedin: () => new LinkedInProvider(),
  x: () => new XProvider(),
};

export function getPublisherProvider(channel: PublishChannel): PublisherProvider {
  const factory = REGISTRY[channel];
  if (!factory) {
    throw new Error(`getPublisherProvider: unknown channel "${channel}"`);
  }
  return factory();
}
