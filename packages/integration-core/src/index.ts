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
export { getAdapter, isProviderImplemented } from './adapters/registry';
