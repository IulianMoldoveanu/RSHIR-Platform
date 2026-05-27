// Factory for resolving a MessagingProvider by kind. Used by Edge Functions
// that handle webhook routing — they look up which channel received the
// inbound message, pick the matching provider, and dispatch.

import type { MessagingKind } from '../../types';
import type { MessagingProvider } from './base';
import { WhatsAppProvider } from './whatsapp';
import { TelegramProvider } from './telegram';

const REGISTRY: Record<MessagingKind, () => MessagingProvider> = {
  whatsapp: () => new WhatsAppProvider(),
  telegram: () => new TelegramProvider(),
};

export function getMessagingProvider(kind: MessagingKind): MessagingProvider {
  const factory = REGISTRY[kind];
  if (!factory) {
    throw new Error(`getMessagingProvider: unknown kind "${kind}"`);
  }
  return factory();
}
