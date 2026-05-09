// Single source of truth for the "Sursă comandă" badge label + Tailwind ring
// classes used on the dashboard orders list (`/dashboard/orders`) and on the
// KDS card (`/kds`). Aligned with the `restaurant_orders.source` enum
// `order_source` values shipped in `20260606_007_order_source_aggregator_values.sql`:
// INTERNAL_STOREFRONT (default — no badge), EXTERNAL_API, POS_PUSH, MANUAL_ADMIN,
// GLOVO, WOLT, BOLT_FOOD, plus legacy TAZZ + FOODPANDA which map to a neutral
// "Sursă externă" pill so historical orders still render after the aggregator
// integrations were removed (Tazz merged into Wolt RO May 2025; Foodpanda exited
// RO 2024).

export type OrderSource =
  | 'INTERNAL_STOREFRONT'
  | 'EXTERNAL_API'
  | 'POS_PUSH'
  | 'MANUAL_ADMIN'
  | 'GLOVO'
  | 'WOLT'
  | 'TAZZ'
  | 'FOODPANDA'
  | 'BOLT_FOOD';

const LEGACY_AGGREGATOR_SOURCES = ['TAZZ', 'FOODPANDA'] as const;
type LegacyAggregatorSource = (typeof LEGACY_AGGREGATOR_SOURCES)[number];

function isLegacyAggregator(s: string): s is LegacyAggregatorSource {
  return (LEGACY_AGGREGATOR_SOURCES as readonly string[]).includes(s);
}

type ActiveOrderSource = Exclude<
  OrderSource,
  'INTERNAL_STOREFRONT' | LegacyAggregatorSource
>;

const SOURCE_LABEL: Record<ActiveOrderSource, string> = {
  EXTERNAL_API: 'API',
  POS_PUSH: 'POS',
  MANUAL_ADMIN: 'Manual',
  GLOVO: 'Glovo',
  WOLT: 'Wolt',
  BOLT_FOOD: 'Bolt Food',
};

// Light theme (used on /dashboard/orders, white background).
const SOURCE_BADGE_CLASS_LIGHT: Record<ActiveOrderSource, string> = {
  EXTERNAL_API: 'bg-sky-50 text-sky-800 ring-sky-200',
  POS_PUSH: 'bg-sky-50 text-sky-800 ring-sky-200',
  MANUAL_ADMIN: 'bg-sky-50 text-sky-800 ring-sky-200',
  GLOVO: 'bg-yellow-50 text-yellow-900 ring-yellow-300',
  WOLT: 'bg-cyan-50 text-cyan-900 ring-cyan-300',
  BOLT_FOOD: 'bg-emerald-50 text-emerald-900 ring-emerald-300',
};

// Dark theme (used on /kds, dark zinc background).
const SOURCE_BADGE_CLASS_DARK: Record<ActiveOrderSource, string> = {
  EXTERNAL_API: 'bg-sky-500/15 text-sky-200 ring-sky-500/40',
  POS_PUSH: 'bg-sky-500/15 text-sky-200 ring-sky-500/40',
  MANUAL_ADMIN: 'bg-sky-500/15 text-sky-200 ring-sky-500/40',
  GLOVO: 'bg-yellow-500/15 text-yellow-200 ring-yellow-500/40',
  WOLT: 'bg-cyan-500/15 text-cyan-200 ring-cyan-500/40',
  BOLT_FOOD: 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/40',
};

const LEGACY_LIGHT = 'bg-zinc-100 text-zinc-800 ring-zinc-300';
const LEGACY_DARK = 'bg-zinc-800 text-zinc-300 ring-zinc-700';

export type OrderSourceTheme = 'light' | 'dark';

export type OrderSourceDisplay = {
  label: string;
  badgeClass: string;
};

// Resolve label + Tailwind classes for any non-INTERNAL_STOREFRONT source.
// Defensive against legacy enum values that the DB still stores on historical
// orders. Caller is responsible for skipping render when source ===
// 'INTERNAL_STOREFRONT' (the default — no need to call out "this came from the
// regular storefront").
export function resolveSourceDisplay(
  source: Exclude<OrderSource, 'INTERNAL_STOREFRONT'>,
  theme: OrderSourceTheme = 'light',
): OrderSourceDisplay {
  if (isLegacyAggregator(source)) {
    return {
      label: 'Sursă externă',
      badgeClass: theme === 'dark' ? LEGACY_DARK : LEGACY_LIGHT,
    };
  }
  const map = theme === 'dark' ? SOURCE_BADGE_CLASS_DARK : SOURCE_BADGE_CLASS_LIGHT;
  return {
    label: SOURCE_LABEL[source],
    badgeClass: map[source],
  };
}
