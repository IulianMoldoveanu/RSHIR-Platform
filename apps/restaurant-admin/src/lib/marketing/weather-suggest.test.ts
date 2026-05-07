// Pure unit test for the weather → marketing-suggestion mapper.

import { describe, expect, it } from 'vitest';
import { suggestForWeather } from './weather-suggest';
import type { WeatherSnapshot } from '@/lib/weather';

function snap(p: Partial<WeatherSnapshot>): WeatherSnapshot {
  return {
    city_id: 'c',
    snapshot_at: '2026-05-08T08:00:00Z',
    temp_c: null,
    feels_like_c: null,
    weather_code: null,
    weather_main: null,
    weather_desc: null,
    humidity_pct: null,
    wind_speed_ms: null,
    precipitation_1h_mm: null,
    ...p,
  };
}

describe('suggestForWeather', () => {
  it('returns no suggestions when snapshot is null', () => {
    expect(suggestForWeather(null)).toEqual([]);
  });

  it('returns no suggestions when nothing is notable', () => {
    // Cloudy 15°C — neither hot, cold, nor precipitating, and not clear.
    expect(
      suggestForWeather(snap({ temp_c: 15, weather_code: 803 })),
    ).toEqual([]);
  });

  it('suggests cold-weather menu when below 5°C', () => {
    const s = suggestForWeather(snap({ temp_c: 2, weather_code: 800 }));
    expect(s.length).toBeGreaterThan(0);
    expect(s[0]?.title_ro).toContain('mâncăruri calde');
  });

  it('suggests hot-weather menu when at or above 28°C', () => {
    const s = suggestForWeather(snap({ temp_c: 31, weather_code: 800 }));
    expect(s[0]?.title_ro).toContain('salate');
  });

  it('suggests comfort food and ops check on rain', () => {
    const s = suggestForWeather(
      snap({ temp_c: 12, weather_code: 500, precipitation_1h_mm: 1.2 }),
    );
    const titles = s.map((x) => x.title_ro).join(' | ');
    expect(titles).toMatch(/plouă/);
    expect(titles).toMatch(/curierilor/);
  });

  it('suggests soup specifically when snowing', () => {
    const s = suggestForWeather(
      snap({ temp_c: -2, weather_code: 600, precipitation_1h_mm: 0.8 }),
    );
    const titles = s.map((x) => x.title_ro).join(' | ');
    expect(titles).toMatch(/ninge/);
    // Snow also triggers cold-weather suggestion at temp<=5.
    expect(titles).toMatch(/mâncăruri calde/);
  });

  it('caps at 3 suggestions even when many rules fire', () => {
    const s = suggestForWeather(
      snap({ temp_c: 1, weather_code: 600, precipitation_1h_mm: 1.0 }),
    );
    expect(s.length).toBeLessThanOrEqual(3);
  });
});
