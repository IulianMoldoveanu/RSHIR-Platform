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
// POS integration adapters above. Multi-gateway since Lane PSP-MULTIGATES-V1:
// Netopia (RO primary), Stripe Connect (fallback/demo), Viva (stub).
export type {
  PspAdapter,
  PspContext,
  PspCredentials,
  PspIntentInput,
  PspIntentResult,
  PspMode,
  PspPayoutStatus,
  PspProviderKey,
  PspWebhookEvent,
} from './payment/contract';
export { netopiaAdapter, createNetopiaCheckoutSession } from './payment/netopia';
export type { CheckoutSessionInput, CheckoutSessionResult } from './payment/netopia';
export { stripeConnectAdapter } from './payment/stripe-connect';
export { vivaAdapter, createVivaCheckoutSession } from './payment/viva';
export { getPspAdapter, isPspProviderImplemented } from './payment/registry';

// Aggregator KDS unification — Glovo / Wolt / Bolt Food adapters.
// 3-tier architecture: official API (Wolt now, Glovo/Bolt after partnership),
// HIR Companion Android app (NotificationListener bridge), Print intercept
// (Star CloudPRNT / ESC-POS). See 2026-05-12-STRATEGIC-MEGA-PLAN.md §4.
export type {
  AggregatorAdapter,
  AggregatorCapabilities,
  AggregatorContext,
  AggregatorCredentials,
  AggregatorOrderEvent,
  AggregatorProviderKey,
  AggregatorSourceSubtype,
} from './aggregator';
export { woltAdapter, printInterceptAdapter } from './aggregator';
export type { PrintInterceptEnvelope } from './aggregator';
