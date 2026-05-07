// Lane WEATHER-SIGNAL-INGESTION: weather → marketing-suggestion mapper.
//
// Pure deterministic function — no DB, no Anthropic call. Given the
// latest snapshot for a city, returns 1-3 short Romanian, formal
// recommendations the OWNER can act on today.
//
// This is a SKELETON for the future Marketing sub-agent (Sprint 14 per
// `ai_tenant_orchestrator.md`). Today the dashboard tile + Hepy can
// call it for free; later, the Sonnet 4.5 Marketing agent will read
// these as starting hypotheses and tailor them with menu + sales
// history. Keep the rules narrow + obvious so the agent layer adds
// value, not duplicates work.

import type { WeatherSnapshot } from '@/lib/weather';

export type WeatherSuggestion = {
  category: 'promo' | 'menu' | 'ops';
  title_ro: string;
  rationale_ro: string;
};

// OpenWeatherMap weather-code groups: https://openweathermap.org/weather-conditions
//   2xx Thunderstorm, 3xx Drizzle, 5xx Rain, 6xx Snow, 7xx Atmosphere
//   800 Clear, 80x Clouds
function isPrecipitating(code: number | null): boolean {
  if (code === null) return false;
  const hundreds = Math.floor(code / 100);
  return hundreds === 2 || hundreds === 3 || hundreds === 5 || hundreds === 6;
}

function isSnowing(code: number | null): boolean {
  if (code === null) return false;
  return Math.floor(code / 100) === 6;
}

function isClear(code: number | null): boolean {
  return code === 800;
}

export function suggestForWeather(
  s: WeatherSnapshot | null,
): WeatherSuggestion[] {
  if (!s) return [];
  const out: WeatherSuggestion[] = [];

  const temp = s.temp_c;
  const code = s.weather_code;
  const precip = s.precipitation_1h_mm ?? 0;

  // Hot — salads + cold drinks + ice cream.
  if (temp !== null && temp >= 28) {
    out.push({
      category: 'promo',
      title_ro: 'Promovați salate, băuturi reci și înghețată',
      rationale_ro: `Astăzi sunt ${temp.toFixed(0)}°C. Comenzile de mâncare caldă scad în zilele toride; produsele reci câștigă cotă.`,
    });
  }

  // Cold — hot food + hot drinks.
  if (temp !== null && temp <= 5) {
    out.push({
      category: 'promo',
      title_ro: 'Promovați mâncăruri calde și băuturi fierbinți',
      rationale_ro: `Sunt doar ${temp.toFixed(0)}°C. Supe, ciorbe, ceaiuri și ciocolată caldă vând mai bine pe vreme rece.`,
    });
  }

  // Rain (incl. drizzle, thunderstorm) — comfort food + push delivery.
  if (isPrecipitating(code) || precip > 0) {
    if (isSnowing(code)) {
      out.push({
        category: 'promo',
        title_ro: 'Promovați supe și ciorbe — ninge',
        rationale_ro: 'Pe ninsoare clientela rămâne acasă; livrările cresc dacă promovați mâncare caldă.',
      });
    } else {
      out.push({
        category: 'promo',
        title_ro: 'Promovați comfort food — plouă',
        rationale_ro: 'Pe ploaie comenzile prin livrare cresc cu ~15-25%. Pizza, paste, ciorbe și deserturi calde funcționează cel mai bine.',
      });
    }
    out.push({
      category: 'ops',
      title_ro: 'Verificați capacitatea curierilor',
      rationale_ro: 'Vremea proastă crește timpul de livrare. Confirmați câți curieri sunt disponibili și luați în calcul un ETA mai larg pentru clienți.',
    });
  }

  // Clear + mild — neutral; one positive nudge for terrace tenants.
  if (isClear(code) && temp !== null && temp >= 18 && temp < 28) {
    out.push({
      category: 'promo',
      title_ro: 'Vreme bună — promovați terasa și meniul de prânz',
      rationale_ro: `Senin și ${temp.toFixed(0)}°C. Profilul comenzilor se mută spre dine-in / pickup; un meniu de prânz vizibil aduce trafic suplimentar.`,
    });
  }

  // Cap at 3 suggestions to keep the dashboard tile + Hepy reply short.
  return out.slice(0, 3);
}
