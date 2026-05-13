export type {
  AggregatorProviderKey,
  AggregatorSourceSubtype,
  AggregatorCredentials,
  AggregatorOrderEvent,
  AggregatorCapabilities,
  AggregatorAdapter,
  AggregatorContext,
} from './contract';

export { woltAdapter } from './wolt';
export { printInterceptAdapter } from './print-intercept';
export type { PrintInterceptEnvelope } from './print-intercept';
