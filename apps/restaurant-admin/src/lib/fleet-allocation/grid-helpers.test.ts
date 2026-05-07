import { describe, it, expect } from 'vitest';
import { cellStatus } from './grid-helpers';
import type { AssignmentRow } from './queries';

function row(overrides: Partial<AssignmentRow> = {}): AssignmentRow {
  return {
    id: overrides.id ?? 'a1',
    fleet_id: overrides.fleet_id ?? 'f1',
    restaurant_tenant_id: overrides.restaurant_tenant_id ?? 'r1',
    role: overrides.role ?? 'primary',
    status: overrides.status ?? 'active',
    assigned_at: overrides.assigned_at ?? '2026-05-01T00:00:00Z',
    notes: overrides.notes ?? null,
  };
}

describe('cellStatus', () => {
  it('returns empty when no rows match', () => {
    expect(cellStatus([])).toEqual({ kind: 'empty' });
  });

  it('classifies a single active primary row', () => {
    const r = row({ role: 'primary', status: 'active' });
    expect(cellStatus([r])).toEqual({ kind: 'primary_active', assignment: r });
  });

  it('classifies a single active secondary row', () => {
    const r = row({ id: 'a2', role: 'secondary', status: 'active' });
    expect(cellStatus([r])).toEqual({ kind: 'secondary_active', assignment: r });
  });

  it('prefers ACTIVE over PAUSED over TERMINATED regardless of order', () => {
    const terminated = row({ id: 't', status: 'terminated', assigned_at: '2026-05-04T00:00:00Z' });
    const paused = row({ id: 'p', status: 'paused', assigned_at: '2026-05-02T00:00:00Z' });
    const active = row({ id: 'a', status: 'active', assigned_at: '2026-05-01T00:00:00Z' });

    const result = cellStatus([terminated, paused, active]);
    expect(result.kind).toBe('primary_active');
    if (result.kind === 'primary_active') expect(result.assignment.id).toBe('a');
  });

  it('within ACTIVE tier picks the freshest assigned_at', () => {
    const old = row({ id: 'old', status: 'active', assigned_at: '2026-04-01T00:00:00Z' });
    const fresh = row({ id: 'fresh', status: 'active', assigned_at: '2026-05-01T00:00:00Z' });

    const result = cellStatus([old, fresh]);
    expect(result.kind).toBe('primary_active');
    if (result.kind === 'primary_active') expect(result.assignment.id).toBe('fresh');
  });

  it('falls back to PAUSED when no ACTIVE exists', () => {
    const terminated = row({ id: 't', status: 'terminated' });
    const paused = row({ id: 'p', status: 'paused' });

    const result = cellStatus([terminated, paused]);
    expect(result.kind).toBe('paused');
  });

  it('falls back to TERMINATED with newest row when nothing else', () => {
    const old = row({ id: 'old', status: 'terminated', assigned_at: '2026-01-01T00:00:00Z' });
    const fresh = row({ id: 'fresh', status: 'terminated', assigned_at: '2026-05-01T00:00:00Z' });

    const result = cellStatus([old, fresh]);
    expect(result.kind).toBe('terminated');
    if (result.kind === 'terminated') expect(result.assignment.id).toBe('fresh');
  });

  it('does not mutate its input array', () => {
    const a = row({ id: 'old', assigned_at: '2026-01-01T00:00:00Z' });
    const b = row({ id: 'fresh', assigned_at: '2026-05-01T00:00:00Z' });
    const input = [a, b];
    const before = input.map((x) => x.id).join(',');
    cellStatus(input);
    const after = input.map((x) => x.id).join(',');
    expect(after).toBe(before); // sort happened on a copy
  });
});
