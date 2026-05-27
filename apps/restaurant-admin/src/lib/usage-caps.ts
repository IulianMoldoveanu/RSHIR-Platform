// Server-side cap enforcement for the Content OS / Hepi / Anthropic surfaces.
//
// Pricing locked 2026-05-27 — every RO tenant runs on the Standard plan
// at 2 RON/order. To stop a single tenant from running our Anthropic /
// Runway / WhatsApp marketing bill into the ground we hard-cap the four
// resources tracked in `public.tenant_usage_counters` and gate every call
// site (chat, video gen, WhatsApp publisher, Anthropic SDK wrapper)
// through `checkAndIncrementUsage(...)`.
//
// Atomic semantics: the RPC `public.check_and_increment_usage` performs
// the upsert + FOR UPDATE + bump in a single statement, so two concurrent
// requests cannot both squeeze under the cap. Failure mode is fail-closed
// — if the RPC errors, the helper throws and the caller surfaces a 429
// or skips the work. We never silently allow an over-cap call.
//
// Anthropic token wiring is best-effort: callers POST-record usage AFTER
// the model has replied. If the cap was already exceeded by a concurrent
// call, the helper returns allowed=false and the caller logs a warning —
// we don't break a mid-conversation reply, but we DO surface the over-cap
// state to dashboards so an operator can intervene.

import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

export type CapResourceKind =
  | 'hepi_conversations'
  | 'content_os_videos'
  | 'whatsapp_marketing'
  | 'anthropic_tokens';

export type CapPeriodKind = 'daily' | 'monthly';

export interface CapCheckResult {
  allowed: boolean;
  used: number;
  cap: number;
  periodKind: CapPeriodKind;
  periodStart: string; // ISO timestamptz
  /** Polite Romanian copy shown on 429 / UI banners. Undefined when allowed=true. */
  message?: string;
}

/** Keep in sync with `check_and_increment_usage` defaults in the migration. */
export const DEFAULT_CAPS: Record<CapResourceKind, { cap: number; period: CapPeriodKind }> = {
  hepi_conversations: { cap: 10, period: 'daily' },
  content_os_videos: { cap: 3, period: 'monthly' },
  whatsapp_marketing: { cap: 30, period: 'monthly' },
  anthropic_tokens: { cap: 50_000, period: 'daily' },
};

/**
 * Atomic check + increment. Returns `allowed: false` when the increment
 * would push usage above the cap; in that case `used` is the pre-increment
 * value (cap is NOT consumed). On `allowed: true`, `used` is the
 * post-increment value.
 *
 * THROWS on RPC failure (network, malformed shape, unknown resource).
 * Fail-closed by design — see file header.
 */
export async function checkAndIncrementUsage(
  tenantId: string,
  resourceKind: CapResourceKind,
  amount = 1,
): Promise<CapCheckResult> {
  if (!tenantId) {
    throw new Error('checkAndIncrementUsage: tenantId is required');
  }
  if (amount <= 0 || !Number.isFinite(amount)) {
    throw new Error(`checkAndIncrementUsage: amount must be > 0, got ${amount}`);
  }
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('check_and_increment_usage', {
    p_tenant_id: tenantId,
    p_resource_kind: resourceKind,
    p_amount: Math.floor(amount),
  });
  if (error) {
    throw new Error(`check_and_increment_usage RPC failed: ${error.message}`);
  }

  const row = data as
    | {
        allowed?: unknown;
        used?: unknown;
        cap?: unknown;
        period_kind?: unknown;
        period_start?: unknown;
      }
    | null;

  if (!row || typeof row !== 'object') {
    throw new Error('check_and_increment_usage RPC returned malformed payload');
  }
  if (typeof row.allowed !== 'boolean') {
    throw new Error('check_and_increment_usage RPC missing allowed field');
  }

  const allowed = row.allowed;
  const used = Number(row.used ?? 0);
  const cap = Number(row.cap ?? 0);
  const periodKind: CapPeriodKind = row.period_kind === 'monthly' ? 'monthly' : 'daily';
  const periodStart = typeof row.period_start === 'string' ? row.period_start : '';

  return {
    allowed,
    used,
    cap,
    periodKind,
    periodStart,
    message: allowed ? undefined : capExceededMessage(resourceKind, cap, periodKind),
  };
}

/**
 * Best-effort variant for the Anthropic SDK wrapper. We must NEVER abort a
 * mid-conversation reply because the cap arithmetic blew up — operators
 * already see the over-cap row in `tenant_usage_counters` and the dashboard
 * banner alerts them. So we swallow errors and return a synthetic
 * "allowed: true" payload when something goes wrong.
 */
export async function recordUsageOrLog(
  tenantId: string,
  resourceKind: CapResourceKind,
  amount: number,
  label: string,
): Promise<CapCheckResult | null> {
  if (amount <= 0 || !Number.isFinite(amount)) return null;
  try {
    const result = await checkAndIncrementUsage(tenantId, resourceKind, amount);
    if (!result.allowed) {
      // Don't break the caller — log + return so the surface above can decide.
      console.warn(
        `[usage-caps] over-cap on ${resourceKind} for tenant=${tenantId} (${label}): used=${result.used} cap=${result.cap}`,
      );
    }
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[usage-caps] recordUsageOrLog threw for ${resourceKind} (${label}): ${msg}`);
    return null;
  }
}

/**
 * Read the current counters for the active windows. Used by the
 * `/dashboard/content` server component to render the banner when a
 * tenant hits or approaches a cap.
 */
export interface CapSnapshot {
  resourceKind: CapResourceKind;
  used: number;
  cap: number;
  periodKind: CapPeriodKind;
  /** 0..1 — used / cap. Clamped to 1. */
  ratio: number;
  /** True when used >= cap. */
  atCap: boolean;
  /** True when 0.8 <= ratio < 1. */
  nearCap: boolean;
}

export async function getUsageSnapshot(tenantId: string): Promise<CapSnapshot[]> {
  if (!tenantId) return [];
  const supabase = createAdminClient();
  // Pull rows for the CURRENT daily + monthly windows. We compute the
  // period_start values in JS instead of relying on the DB to keep the
  // query a single round-trip.
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data, error } = await sb
    .from('tenant_usage_counters')
    .select('resource_kind, used_count, cap_count, period_kind, period_start')
    .eq('tenant_id', tenantId)
    .in('period_start', [dayStart.toISOString(), monthStart.toISOString()]);

  if (error) {
    console.warn(`[usage-caps] getUsageSnapshot failed: ${error.message}`);
    return [];
  }

  const rows = (data ?? []) as Array<{
    resource_kind: string;
    used_count: number;
    cap_count: number;
    period_kind: string;
    period_start: string;
  }>;

  // Build a default-zero snapshot for every known resource so the banner
  // can still render when no row exists yet (first day of the period).
  const out: CapSnapshot[] = [];
  for (const kind of Object.keys(DEFAULT_CAPS) as CapResourceKind[]) {
    const def = DEFAULT_CAPS[kind];
    const row = rows.find(
      (r) =>
        r.resource_kind === kind &&
        (def.period === 'daily'
          ? r.period_start === dayStart.toISOString()
          : r.period_start === monthStart.toISOString()),
    );
    const used = row?.used_count ?? 0;
    const cap = row?.cap_count ?? def.cap;
    const ratio = cap > 0 ? Math.min(1, used / cap) : 0;
    out.push({
      resourceKind: kind,
      used,
      cap,
      periodKind: def.period,
      ratio,
      atCap: used >= cap,
      nearCap: ratio >= 0.8 && used < cap,
    });
  }
  return out;
}

const RESOURCE_LABEL_RO: Record<CapResourceKind, string> = {
  hepi_conversations: 'conversații cu Hepi',
  content_os_videos: 'reclame video',
  whatsapp_marketing: 'mesaje WhatsApp marketing',
  anthropic_tokens: 'volumul de gândire AI',
};

export function capResourceLabel(kind: CapResourceKind): string {
  return RESOURCE_LABEL_RO[kind] ?? kind;
}

/**
 * Polite, NON-blame Romanian copy. Same template across surfaces so the
 * patron sees the same wording on WhatsApp, the dashboard banner, and the
 * 429 response body.
 */
export function capExceededMessage(
  kind: CapResourceKind,
  cap: number,
  periodKind: string,
): string {
  const periodLabel = periodKind === 'daily' ? 'pe zi' : 'pe lună';
  const continueLabel = periodKind === 'daily' ? 'mâine' : 'luna viitoare';
  return (
    `Hai patroane, ai folosit toate cele ${cap} ${capResourceLabel(kind)} ${periodLabel} ` +
    `incluse în planul Standard. Continui ${continueLabel}. ` +
    `Vrei un plan extins? Trimite mesaj la +40 723 XXX XXX.`
  );
}
