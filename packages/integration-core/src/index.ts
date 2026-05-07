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

// Datecs FiscalNet-2 receipt builder — pure helper, used by both the
// optional Windows companion (tools/datecs-companion) and any future
// HIR-side dispatcher. No I/O, safe to import from any runtime.
export {
  buildDatecsReceipt,
  roundRon,
  sanitizeLine,
  chunkLine,
} from './receipts/datecs';
export type {
  BuildReceiptInput,
  DatecsReceiptProgram,
  DatecsReceiptStep,
  DatecsVatGroup,
} from './receipts/datecs';

// Payment Service Provider (PSP) adapters — separate contract from the
// POS integration adapters above. First adapter: Netopia (RO).
export type {
  PspAdapter,
  PspContext,
  PspCredentials,
  PspIntentInput,
  PspIntentResult,
  PspMode,
  PspProviderKey,
  PspWebhookEvent,
} from './payment/contract';
export { netopiaAdapter } from './payment/netopia';
