import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GOAL_RON,
  MAX_GOAL_RON,
  MIN_GOAL_RON,
  clampGoal,
  computeProgress,
} from '../src/lib/daily-goal';

describe('clampGoal', () => {
  it('keeps in-range values', () => {
    expect(clampGoal(200)).toBe(200);
    expect(clampGoal(MIN_GOAL_RON)).toBe(MIN_GOAL_RON);
    expect(clampGoal(MAX_GOAL_RON)).toBe(MAX_GOAL_RON);
  });
  it('clamps below MIN', () => {
    expect(clampGoal(10)).toBe(MIN_GOAL_RON);
  });
  it('clamps above MAX', () => {
    expect(clampGoal(5000)).toBe(MAX_GOAL_RON);
  });
  it('rounds to integer', () => {
    expect(clampGoal(200.7)).toBe(201);
  });
  it('falls back to default on non-finite input', () => {
    expect(clampGoal(Number.NaN)).toBe(DEFAULT_GOAL_RON);
  });
});

describe('computeProgress', () => {
  it('reports under-target progress', () => {
    const r = computeProgress(50, 200);
    expect(r.progressPct).toBe(25);
    expect(r.reached).toBe(false);
    expect(r.delta).toBe(-150);
  });
  it('caps visual progress at 100% even when over-target', () => {
    const r = computeProgress(240, 200);
    expect(r.progressPct).toBe(100);
    expect(r.rawPct).toBe(120);
    expect(r.reached).toBe(true);
    expect(r.delta).toBe(40);
  });
  it('treats exact match as reached', () => {
    const r = computeProgress(200, 200);
    expect(r.reached).toBe(true);
    expect(r.progressPct).toBe(100);
  });
  it('falls back to DEFAULT_GOAL when goal is 0', () => {
    const r = computeProgress(100, 0);
    expect(r.progressPct).toBeGreaterThan(0);
    expect(r.progressPct).toBeLessThanOrEqual(100);
  });
});
