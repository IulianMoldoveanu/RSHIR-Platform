export type {
  AdapterContext,
  AdapterResult,
  IntegrationAdapter,
  IntegrationMode,
  MenuEventName,
  MenuItemPayload,
  OrderEventName,
  OrderPayload,
  OrderSource,
  ProviderKey,
  WebhookEvent,
} from './contract';

export { mockAdapter } from './adapters/mock';
export {
  customAdapter,
  validateCustomConfig,
  isSafeWebhookUrl,
} from './adapters/custom';
export type { CustomConfig, CustomConfigValidation, CustomEnvelope } from './adapters/custom';
export { getAdapter, isProviderImplemented } from './adapters/registry';
