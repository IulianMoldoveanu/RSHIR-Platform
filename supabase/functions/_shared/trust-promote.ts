// HIR F6 — Trust auto-promotion logic
//
// Pure decision function consumed by the `trust-promote-daily` Edge
// Function. Kept dependency-free so it can be unit-tested in Node/vitest
// alongside the orchestrator types.
//
// Rules:
//   PROPOSE_ONLY    -> AUTO_REVERSIBLE  : need >= 20 consecutive clean runs, 0 reverts
//   AUTO_REVERSIBLE -> AUTO_FULL        : need >= 50 consecutive clean runs, 0 reverts
//   Any REVERTED run resets consecutive_clean_runs to 0.
//   If reverts_30d > DEMOTION_REVERT_THRESHOLD, demote one level.
//   Destructive categories never auto-promote (defense in depth — the
//   dispatcher's hard guard already pins them to PROPOSE_ONLY).
//   `auto_promote_eligible = false` opts the row out entirely.
//   Never exceed the tenant's `max_trust` (default AUTO_FULL).

export type TrustLevel = 'PROPOSE_ONLY' | 'AUTO_REVERSIBLE' | 'AUTO_FULL';

export const PROMOTE_TO_AUTO_REVERSIBLE_THRESHOLD = 20;
export const PROMOTE_TO_AUTO_FULL_THRESHOLD = 50;
export const DEMOTION_REVERT_THRESHOLD = 3;

const LEVEL_ORDER: TrustLevel[] = ['PROPOSE_ONLY', 'AUTO_REVERSIBLE', 'AUTO_FULL'];

function levelIndex(l: TrustLevel): number {
  return LEVEL_ORDER.indexOf(l);
}

export type TrustRowInput = {
  trustLevel: TrustLevel;
  isDestructive: boolean;
  autoPromoteEligible: boolean;
  consecutiveCleanRuns: number;
};

export type WindowStats = {
  // Clean EXECUTED runs in the last 30 days (no REVERTED child).
  cleanRuns30d: number;
  // REVERTED rows in the last 30 days (regardless of parent agent).
  reverts30d: number;
};

export type PromotionDecision =
  | { kind: 'no_change'; reason: string }
  | {
      kind: 'promote';
      from: TrustLevel;
      to: TrustLevel;
      // New value for consecutive_clean_runs after the promotion. We reset
      // to 0 so the next-tier countdown starts fresh from the promotion
      // event — this prevents a tenant that hits 70 clean runs from
      // jumping PROPOSE_ONLY -> AUTO_FULL in a single tick.
      newConsecutiveCleanRuns: number;
    }
  | {
      kind: 'demote';
      from: TrustLevel;
      to: TrustLevel;
      newConsecutiveCleanRuns: 0;
    }
  | {
      kind: 'reset_counter';
      newConsecutiveCleanRuns: 0;
    };

// Decide what to do with one (tenant, agent, category) trust row given
// the last-30-day window stats. Pure — no I/O.
export function evaluatePromotion(
  row: TrustRowInput,
  window: WindowStats,
  maxTrust: TrustLevel = 'AUTO_FULL',
): PromotionDecision {
  // Defense in depth — the DB-side `is_destructive` flag already pins
  // these to PROPOSE_ONLY in the dispatcher, but we also refuse to touch
  // them here so the audit log doesn't show a meaningless promotion row.
  if (row.isDestructive) {
    return { kind: 'no_change', reason: 'destructive_category' };
  }
  if (!row.autoPromoteEligible) {
    return { kind: 'no_change', reason: 'auto_promote_disabled' };
  }

  // Demotion path: too many reverts in 30 days means the agent is
  // misbehaving on this category. Drop one level (PROPOSE_ONLY is the
  // floor).
  if (window.reverts30d > DEMOTION_REVERT_THRESHOLD) {
    const fromIdx = levelIndex(row.trustLevel);
    if (fromIdx > 0) {
      return {
        kind: 'demote',
        from: row.trustLevel,
        to: LEVEL_ORDER[fromIdx - 1]!,
        newConsecutiveCleanRuns: 0,
      };
    }
    // Already at floor — just keep the counter at 0.
    if (row.consecutiveCleanRuns > 0) {
      return { kind: 'reset_counter', newConsecutiveCleanRuns: 0 };
    }
    return { kind: 'no_change', reason: 'demotion_at_floor' };
  }

  // Any revert (even one) resets the counter — promotion requires an
  // unbroken streak.
  if (window.reverts30d > 0 && row.consecutiveCleanRuns > 0) {
    return { kind: 'reset_counter', newConsecutiveCleanRuns: 0 };
  }

  // Promotion path. Use the larger of (stored counter, observed clean
  // runs in window) so we don't lose progress if the cron missed a day
  // and the counter never got bumped.
  const effective = Math.max(row.consecutiveCleanRuns, window.cleanRuns30d);
  const maxIdx = levelIndex(maxTrust);
  const currentIdx = levelIndex(row.trustLevel);
  if (currentIdx >= maxIdx) {
    return { kind: 'no_change', reason: 'already_at_max' };
  }

  if (
    row.trustLevel === 'PROPOSE_ONLY' &&
    effective >= PROMOTE_TO_AUTO_REVERSIBLE_THRESHOLD &&
    window.reverts30d === 0
  ) {
    return {
      kind: 'promote',
      from: 'PROPOSE_ONLY',
      to: 'AUTO_REVERSIBLE',
      newConsecutiveCleanRuns: 0,
    };
  }
  if (
    row.trustLevel === 'AUTO_REVERSIBLE' &&
    effective >= PROMOTE_TO_AUTO_FULL_THRESHOLD &&
    window.reverts30d === 0
  ) {
    return {
      kind: 'promote',
      from: 'AUTO_REVERSIBLE',
      to: 'AUTO_FULL',
      newConsecutiveCleanRuns: 0,
    };
  }

  return { kind: 'no_change', reason: 'threshold_not_met' };
}

// Format a Romanian Telegram line for a promotion event. Used by the
// daily worker; kept here so the test suite can pin the exact wording.
export function formatPromotionNotification(
  agentName: string,
  actionCategory: string,
  to: TrustLevel,
): string {
  const levelLabel =
    to === 'AUTO_REVERSIBLE'
      ? 'AUTO_REVERSIBLE'
      : to === 'AUTO_FULL'
        ? 'AUTO_FULL'
        : to;
  if (to === 'AUTO_REVERSIBLE') {
    return `Hepy: agent ${agentName} (${actionCategory}) promovat la ${levelLabel} pe baza ultimelor 20 propuneri 100% acceptate.`;
  }
  if (to === 'AUTO_FULL') {
    return `Hepy: agent ${agentName} (${actionCategory}) promovat la ${levelLabel} dupa 50 de propuneri consecutiv acceptate.`;
  }
  return `Hepy: agent ${agentName} (${actionCategory}) recalibrat la ${levelLabel}.`;
}

export function formatDemotionNotification(
  agentName: string,
  actionCategory: string,
  from: TrustLevel,
  to: TrustLevel,
  reverts30d: number,
): string {
  return `Hepy: agent ${agentName} (${actionCategory}) demolat ${from} -> ${to} (${reverts30d} anulari in 30 zile).`;
}
