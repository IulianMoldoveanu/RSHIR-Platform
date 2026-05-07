// Pure unit test for the events → marketing-suggestion mapper.

import { describe, expect, it } from 'vitest';
import { suggestForEvents } from './events-suggest';
import type { CityEvent } from '@/lib/events';

function ev(p: Partial<CityEvent>): CityEvent {
  return {
    id: p.id ?? 'e-' + Math.random().toString(36).slice(2),
    city_id: 'c',
    event_name: 'Concert Test',
    event_type: 'concert',
    start_at: new Date(Date.now() + 18 * 3600 * 1000).toISOString(),
    end_at: null,
    venue_name: 'Stadion',
    venue_lat: null,
    venue_lon: null,
    expected_attendance: null,
    url: null,
    source: 'ticketmaster',
    ...p,
  };
}

describe('suggestForEvents', () => {
  it('returns no suggestions for null / empty input', () => {
    expect(suggestForEvents(null)).toEqual([]);
    expect(suggestForEvents([])).toEqual([]);
  });

  it('emits ops + promo for imminent big concert (next 36h)', () => {
    const s = suggestForEvents([
      ev({ event_type: 'concert', start_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString() }),
    ]);
    const titles = s.map((x) => x.title_ro).join(' | ');
    expect(titles).toMatch(/curierilor/);
    expect(titles).toMatch(/promoție|promotie/i);
  });

  it('skips small events (attendance < 1000)', () => {
    const s = suggestForEvents([
      ev({
        event_type: 'concert',
        expected_attendance: 200,
        start_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
      }),
    ]);
    expect(s).toEqual([]);
  });

  it('emits festival menu nudge for festival in the next week', () => {
    const s = suggestForEvents([
      ev({
        event_type: 'festival',
        event_name: 'Festivalul Berii',
        // Outside the 36h imminent window, inside the 7d soon window.
        start_at: new Date(Date.now() + 4 * 24 * 3600 * 1000).toISOString(),
      }),
    ]);
    const titles = s.map((x) => x.title_ro).join(' | ');
    expect(titles).toMatch(/festival/i);
  });

  it('caps at 3 suggestions', () => {
    const s = suggestForEvents([
      ev({ id: 'a', event_type: 'concert', start_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString() }),
      ev({ id: 'b', event_type: 'festival', start_at: new Date(Date.now() + 4 * 24 * 3600 * 1000).toISOString() }),
    ]);
    expect(s.length).toBeLessThanOrEqual(3);
  });

  it('does not surface "other" / theatre events as imminent ops alerts', () => {
    const s = suggestForEvents([
      ev({ event_type: 'theatre', start_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString() }),
    ]);
    expect(s).toEqual([]);
  });
});
