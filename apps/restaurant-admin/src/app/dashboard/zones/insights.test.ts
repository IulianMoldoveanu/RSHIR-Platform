import { describe, it, expect } from 'vitest';
import { buildInsights } from './insights';

const ZONE_A = '00000000-0000-0000-0000-00000000000a';
const ZONE_B = '00000000-0000-0000-0000-00000000000b';

const zones = new Map([
  [ZONE_A, 'Centru'],
  [ZONE_B, 'Tractorul'],
]);

const HOURS = (h: number) => h * 60 * 60 * 1000;

describe('buildInsights', () => {
  it('returns an "all clear" insight when there were no pauses', () => {
    const out = buildInsights([], zones);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('all-clear');
    expect(out[0]!.severity).toBe('info');
  });

  it('flags a zone with cumulative pause exceeding the threshold', () => {
    const now = Date.now();
    const pauses = [
      {
        zone_id: ZONE_A,
        reason: 'lipsa_curier',
        paused_at: new Date(now - HOURS(5)).toISOString(),
        paused_until: null,
        resumed_at: new Date(now - HOURS(2)).toISOString(), // 3h pause
      },
    ];
    const out = buildInsights(pauses, zones);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe(`pause-${ZONE_A}`);
    expect(out[0]!.severity).toBe('warn');
    expect(out[0]!.title).toContain('Centru');
    expect(out[0]!.title).toContain('3');
    expect(out[0]!.body).toContain('lipsa curierilor');
  });

  it('dedups frequent-pause insight when the zone already has a duration insight', () => {
    const now = Date.now();
    // 6 short pauses on ZONE_A totalling > PAUSE_WARN_HOURS (each 30 min = 3h).
    const pauses = Array.from({ length: 6 }, (_, i) => ({
      zone_id: ZONE_A,
      reason: 'manual',
      paused_at: new Date(now - HOURS(i + 1)).toISOString(),
      paused_until: new Date(now - HOURS(i + 1) + 30 * 60_000).toISOString(),
      resumed_at: null,
    }));
    const out = buildInsights(pauses, zones);
    // Only the duration insight should land — the frequency insight is deduped.
    expect(out.filter((i) => i.id.startsWith('pause-'))).toHaveLength(1);
    expect(out.find((i) => i.id === `frequent-${ZONE_A}`)).toBeUndefined();
  });

  it('emits a frequency insight only when no duration insight exists for that zone', () => {
    const now = Date.now();
    // 5 very short pauses (5 min each = 25 min total, below the 2h threshold).
    const pauses = Array.from({ length: 5 }, (_, i) => ({
      zone_id: ZONE_B,
      reason: 'manual',
      paused_at: new Date(now - HOURS(i + 1)).toISOString(),
      paused_until: new Date(now - HOURS(i + 1) + 5 * 60_000).toISOString(),
      resumed_at: null,
    }));
    const out = buildInsights(pauses, zones);
    expect(out.find((i) => i.id === `frequent-${ZONE_B}`)).toBeDefined();
    expect(out.find((i) => i.id === `pause-${ZONE_B}`)).toBeUndefined();
  });

  it('caps output at 3 insights', () => {
    const now = Date.now();
    const heavyPause = (zoneId: string) => ({
      zone_id: zoneId,
      reason: 'lipsa_curier',
      paused_at: new Date(now - HOURS(5)).toISOString(),
      paused_until: null,
      resumed_at: new Date(now - HOURS(1)).toISOString(),
    });
    const manyZones = new Map<string, string>();
    const pauses = [];
    for (let i = 0; i < 6; i++) {
      const id = `00000000-0000-0000-0000-00000000000${i}`;
      manyZones.set(id, `Zona ${i}`);
      pauses.push(heavyPause(id));
    }
    const out = buildInsights(pauses, manyZones);
    expect(out.length).toBeLessThanOrEqual(3);
  });
});
