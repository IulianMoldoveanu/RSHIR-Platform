/**
 * Pure helpers for the Fleet Allocation grid UI. Lives outside the client
 * component so it's straightforward to unit-test without mounting React.
 */

import type { AssignmentRow } from './queries';

export type CellStatus =
  | { kind: 'empty' }
  | { kind: 'primary_active'; assignment: AssignmentRow }
  | { kind: 'secondary_active'; assignment: AssignmentRow }
  | { kind: 'paused'; assignment: AssignmentRow }
  | { kind: 'terminated'; assignment: AssignmentRow };

/**
 * Resolves the visual status of a (fleet, restaurant) cell from the row
 * set that pairs them. Multiple rows are expected when re-assignment has
 * happened (terminated history + new active row).
 *
 * Priority: ACTIVE > PAUSED > TERMINATED. Within each tier the most
 * recently assigned row wins.
 */
export function cellStatus(rows: AssignmentRow[]): CellStatus {
  if (rows.length === 0) return { kind: 'empty' };

  // Sort newest first so `find` picks the freshest row inside each tier.
  const sorted = [...rows].sort((a, b) => (a.assigned_at < b.assigned_at ? 1 : -1));

  const active = sorted.find((a) => a.status === 'active');
  if (active) {
    return active.role === 'primary'
      ? { kind: 'primary_active', assignment: active }
      : { kind: 'secondary_active', assignment: active };
  }

  const paused = sorted.find((a) => a.status === 'paused');
  if (paused) return { kind: 'paused', assignment: paused };

  return { kind: 'terminated', assignment: sorted[0] };
}
