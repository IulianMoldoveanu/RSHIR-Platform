// Type mirror of the Master Orchestrator dispatcher that lives in
// `supabase/functions/_shared/master-orchestrator.ts`.
//
// Why a mirror and not a shared package: the Edge Function side runs Deno
// (https URL imports, no bundler) while the admin app runs Node + Next.js
// (TS paths, tsconfig). They CANNOT share a TypeScript file directly.
// Instead we duplicate the type definitions and keep them in sync by hand
// (small surface; CI typecheck would fail loudly on either side if they
// drifted in a way that broke a caller).

export type Channel = 'telegram' | 'web' | 'voice';

export type AgentName =
  | 'master'
  | 'menu'
  | 'marketing'
  | 'ops'
  | 'cs'
  | 'analytics'
  | 'finance'
  | 'compliance'
  | 'growth';

export type TrustLevel = 'PROPOSE_ONLY' | 'AUTO_REVERSIBLE' | 'AUTO_FULL';

export type RunState = 'PROPOSED' | 'EXECUTED' | 'REVERTED' | 'REJECTED';

export type RegistryEntry = {
  name: string;
  agent: AgentName;
  defaultCategory: string;
  description: string;
  readOnly?: boolean;
};

// Same list as `_shared/master-orchestrator.ts` KNOWN_INTENTS. Drift is
// caught by the test in master-orchestrator.test.ts.
export const KNOWN_INTENTS: RegistryEntry[] = [
  { name: 'analytics.summary', agent: 'analytics', defaultCategory: 'analytics.read', description: 'Sumar comenzi/încasări pentru o perioadă.', readOnly: true },
  { name: 'analytics.top_products', agent: 'analytics', defaultCategory: 'analytics.read', description: 'Top produse vândute pentru o perioadă.', readOnly: true },
  { name: 'analytics.recommendations_today', agent: 'analytics', defaultCategory: 'analytics.read', description: 'Ultimele recomandări de creștere pentru tenant.', readOnly: true },
  { name: 'analytics.report', agent: 'analytics', defaultCategory: 'analytics.read', description: 'Raport zilnic compact (orders + sales + low_stock).', readOnly: true },
  { name: 'analytics.explain_anomaly', agent: 'analytics', defaultCategory: 'analytics.explain_anomaly.read', description: 'Explică o cifră (orders/revenue/aov) cu 2-3 ipoteze.', readOnly: true },
  { name: 'ops.orders_now', agent: 'ops', defaultCategory: 'ops.read', description: 'Câte comenzi sunt active acum.', readOnly: true },
  { name: 'ops.couriers_online', agent: 'ops', defaultCategory: 'ops.read', description: 'Câți curieri sunt online acum.', readOnly: true },
  { name: 'ops.low_stock', agent: 'ops', defaultCategory: 'ops.read', description: 'Produse cu stoc scăzut.', readOnly: true },
  { name: 'ops.weather_today', agent: 'ops', defaultCategory: 'ops.read', description: 'Vremea curentă pentru orașul tenantului.', readOnly: true },
  // Sprint 14 ops sub-agent (PR #364):
  { name: 'ops.suggest_delivery_zones', agent: 'ops', defaultCategory: 'ops.read', description: 'Sugerează zone noi de livrare pe baza comenzilor din 30 de zile.', readOnly: true },
  { name: 'ops.optimize_courier_schedule', agent: 'ops', defaultCategory: 'ops.read', description: 'Propune program curieri pe baza istoricului 14 zile.', readOnly: true },
  { name: 'ops.flag_kitchen_bottlenecks', agent: 'ops', defaultCategory: 'ops.read', description: 'Identifică produsele care încetinesc fluxul (proxy 7 zile).', readOnly: true },
  { name: 'cs.reservation_create', agent: 'cs', defaultCategory: 'reservation.create', description: 'Creează o rezervare nouă.' },
  { name: 'cs.reservation_list', agent: 'cs', defaultCategory: 'reservation.read', description: 'Listează rezervările următoare.', readOnly: true },
  { name: 'cs.reservation_cancel', agent: 'cs', defaultCategory: 'reservation.cancel', description: 'Anulează o rezervare după token.' },
  { name: 'menu.description_update', agent: 'menu', defaultCategory: 'description.update', description: 'Actualizează descrierea unui produs.' },
  { name: 'menu.price_change', agent: 'menu', defaultCategory: 'price.change', description: 'Schimbă prețul unui produs (destructiv).' },
  { name: 'marketing.draft_post', agent: 'marketing', defaultCategory: 'social.draft', description: 'Generează draft de postare social.' },
  { name: 'marketing.publish_post', agent: 'marketing', defaultCategory: 'social.publish', description: 'Publică o postare social.' },
];

// Display metadata for the trust UI (per (agent, action_category) pair).
// Destructive flag mirrors the DB `is_destructive` column — UI initializes
// new rows with this default, but the source of truth remains the DB.
export type TrustCategoryMeta = {
  agent: AgentName;
  category: string;
  label: string;
  destructive: boolean;
};

export const TRUST_CATEGORIES: TrustCategoryMeta[] = [
  { agent: 'menu', category: 'description.update', label: 'Meniu — descrieri produse', destructive: false },
  { agent: 'menu', category: 'price.change', label: 'Meniu — schimbare preț', destructive: true },
  { agent: 'menu', category: 'item.delete', label: 'Meniu — ștergere produs', destructive: true },
  { agent: 'menu', category: 'photo.upload', label: 'Meniu — încărcare fotografii', destructive: false },
  { agent: 'marketing', category: 'social.draft', label: 'Marketing — draft postare', destructive: false },
  { agent: 'marketing', category: 'social.publish', label: 'Marketing — publicare postare', destructive: false },
  { agent: 'marketing', category: 'email.campaign', label: 'Marketing — campanie email', destructive: false },
  { agent: 'cs', category: 'reservation.create', label: 'Service clienți — creare rezervare', destructive: false },
  { agent: 'cs', category: 'reservation.cancel', label: 'Service clienți — anulare rezervare', destructive: true },
  { agent: 'cs', category: 'review.reply', label: 'Service clienți — răspuns recenzie', destructive: false },
  { agent: 'ops', category: 'item.sold_out', label: 'Operațiuni — marcare epuizat temporar', destructive: false },
  { agent: 'ops', category: 'hours.change', label: 'Operațiuni — schimbare program', destructive: true },
  { agent: 'finance', category: 'refund.issue', label: 'Financiar — emitere rambursare', destructive: true },
  { agent: 'analytics', category: 'analytics.read', label: 'Analiză — rapoarte (read-only)', destructive: false },
  { agent: 'analytics', category: 'analytics.explain_anomaly.read', label: 'Analiză — explicație cifră (AI, read-only)', destructive: false },
];

// One-line RO label per trust level for the UI selects.
export const TRUST_LEVEL_LABELS: Record<TrustLevel, string> = {
  PROPOSE_ONLY: 'Doar propune (aprob eu)',
  AUTO_REVERSIBLE: 'Aplică automat (reversibil 24h)',
  AUTO_FULL: 'Aplică automat (avansat)',
};

export const RUN_STATE_LABELS: Record<RunState, string> = {
  PROPOSED: 'În așteptare',
  EXECUTED: 'Aplicată',
  REVERTED: 'Anulată',
  REJECTED: 'Respinsă',
};
