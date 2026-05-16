/**
 * Open-Meteo weather fetch with a 30-minute in-process cache.
 *
 * Used on the courier dashboard to surface weather conditions at the
 * courier's last-known GPS position. The free Open-Meteo API requires
 * no auth key, so this is safe to call from any server context.
 *
 * Cache strategy: module-level singleton. Next.js server components run
 * in the same Node process between requests, so a module-level object
 * survives across renders within the same process lifetime. We cap staleness
 * at 30 minutes — weather rarely changes faster than that for road safety
 * purposes. The cache is per-coordinate rounded to 2 decimal places so
 * a courier moving across the city doesn't always hit the miss path.
 */

export type WeatherCondition =
  | 'clear'
  | 'cloudy'
  | 'rain'
  | 'snow'
  | 'fog'
  | 'storm'
  | 'unknown';

export type WeatherData = {
  tempC: number;
  condition: WeatherCondition;
  /** WMO weather code from Open-Meteo — used to derive `condition`. */
  wmoCode: number;
};

type CacheEntry = {
  data: WeatherData;
  fetchedAt: number; // ms epoch
};

// Brașov city center fallback (lat, lng).
export const BRASOV_CENTER = { lat: 45.6427, lng: 25.5887 };

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const cache = new Map<string, CacheEntry>();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

/**
 * Map WMO weather interpretation codes to a simplified condition enum.
 * https://open-meteo.com/en/docs#weathervariables — "WMO Weather interpretation codes"
 */
function wmoToCondition(code: number): WeatherCondition {
  if (code === 0) return 'clear';
  if (code <= 3) return 'cloudy';
  if (code <= 19) return 'fog';
  if (code <= 49) return 'fog';
  if (code <= 69) return 'rain';
  if (code <= 79) return 'snow';
  if (code <= 82) return 'rain';
  if (code <= 86) return 'snow';
  if (code <= 99) return 'storm';
  return 'unknown';
}

/**
 * Fetch current weather for the given coordinates.
 * Returns cached data if the last fetch was within 30 minutes.
 * Returns null on any network or parse failure — callers must handle gracefully.
 */
export async function fetchWeather(
  lat: number,
  lng: number,
): Promise<WeatherData | null> {
  const key = cacheKey(lat, lng);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
    return hit.data;
  }

  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', lat.toFixed(4));
    url.searchParams.set('longitude', lng.toFixed(4));
    url.searchParams.set('current_weather', 'true');

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 0 }, // no Next.js fetch cache on top
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      current_weather?: { temperature: number; weathercode: number };
    };
    const cw = json.current_weather;
    if (!cw || typeof cw.temperature !== 'number' || typeof cw.weathercode !== 'number') {
      return null;
    }

    const data: WeatherData = {
      tempC: Math.round(cw.temperature),
      condition: wmoToCondition(cw.weathercode),
      wmoCode: cw.weathercode,
    };

    cache.set(key, { data, fetchedAt: Date.now() });
    return data;
  } catch {
    return null;
  }
}

/**
 * Human-readable RO label for a weather condition.
 */
export function conditionLabel(condition: WeatherCondition): string {
  switch (condition) {
    case 'clear': return 'cer senin';
    case 'cloudy': return 'noros';
    case 'rain': return 'ploaie';
    case 'snow': return 'ninsoare';
    case 'fog': return 'ceață';
    case 'storm': return 'furtună';
    default: return '';
  }
}

/**
 * Returns a safety reminder string when weather poses a driving hazard,
 * or null when conditions are fine.
 */
export function safetyReminder(data: WeatherData): string | null {
  if (data.condition === 'rain' || data.condition === 'storm') {
    return 'Atenție la ploaie. Condu cu grijă.';
  }
  if (data.condition === 'snow') {
    return 'Ninsoare. Reduce viteza și fii atent pe carosabil.';
  }
  if (data.condition === 'fog') {
    return 'Ceață — vizibilitate redusă. Condu cu grijă.';
  }
  if (data.tempC < 5) {
    return 'Vreme rece. Asigură-te că ai îmbrăcăminte termoizolantă.';
  }
  return null;
}
