// Stream UI-3 — Rating + Job board (Open Marketplace Extensions).
//
// Feature-flag helpers used by the rating + job-board UI. Centralising the
// env-var lookups in one module means a flip in env config switches every
// surface together — no risk of one page rendering while a sibling 404s
// because of a typo'd env key.
//
// All flags default OFF. The convention matches the rest of the courier app
// (`HIR_FEATURE_MARKETPLACE_ENABLED` etc.). Server-side reads only; never
// expose these as NEXT_PUBLIC_ flags because the UI gating is paired with
// server-action gating, and we don't want a client tab to second-guess the
// server.

/**
 * Driver score + fleet aggregate UI gate. Wraps:
 *   - /dashboard/score                 (courier-private score)
 *   - /fleet/score                     (fleet aggregate + tier badge)
 *   - the data flow in driver_scores / fleet_aggregate_scores tables
 *
 * The underlying schema (migration 20260616_012_rating_dual_axis.sql) is
 * already live; this flag is the UI/edge-fn gate per CLAUDE.md §5.
 */
export function isRatingSystemEnabled(): boolean {
  return process.env.HIR_FEATURE_RATING_SYSTEM_ENABLED === 'true';
}

/**
 * Courier job-board UI gate. Wraps:
 *   - /jobs                            (courier browse OPEN listings)
 *   - /jobs/[id]                       (courier listing detail + apply)
 *   - /fleet/jobs                      (fleet manage own listings)
 *   - /fleet/jobs/new                  (fleet create listing)
 *   - /fleet/jobs/[id]/applications    (fleet kanban applicants)
 *
 * Schema (20260616_013_courier_job_board.sql) is already live; this is the
 * UI gate. Fleet writes still depend on `is_fleet_owner_of(fleet_id)` so a
 * misset flag in a stale tab can't bypass RLS — defence in depth.
 */
export function isJobBoardEnabled(): boolean {
  return process.env.HIR_FEATURE_JOB_BOARD_ENABLED === 'true';
}
