// Polish 2026-05-06: hard-coded centroid coordinates for the most common
// Romanian cities used during onboarding. Used by the zones page empty-
// state CTA to seed a default 5 km delivery zone in one click when the
// tenant has set a free-text city but hasn't yet pinned a precise location.
//
// Geocoding is intentionally avoided here — these centers only need to be
// "good enough" to draw a circular polygon for the operator to refine.
// Coordinates are rough city-hall approximations; the operator will reshape
// the polygon on the map if they care about exact bounds.

export type CityCenter = { name: string; lat: number; lng: number };

// Lower-cased keys (and Romanian-diacritics-stripped variants) → canonical
// city center. The lookup function below normalises before matching so
// "BRASOV", "Brașov", and "brasov" all hit the same row.
const CITIES: Record<string, CityCenter> = {
  bucuresti: { name: 'București', lat: 44.4268, lng: 26.1025 },
  brasov: { name: 'Brașov', lat: 45.6579, lng: 25.6012 },
  cluj: { name: 'Cluj-Napoca', lat: 46.7712, lng: 23.6236 },
  'cluj-napoca': { name: 'Cluj-Napoca', lat: 46.7712, lng: 23.6236 },
  timisoara: { name: 'Timișoara', lat: 45.7489, lng: 21.2087 },
  iasi: { name: 'Iași', lat: 47.1585, lng: 27.6014 },
  constanta: { name: 'Constanța', lat: 44.1733, lng: 28.6383 },
  craiova: { name: 'Craiova', lat: 44.3302, lng: 23.7949 },
  galati: { name: 'Galați', lat: 45.4353, lng: 28.008 },
  ploiesti: { name: 'Ploiești', lat: 44.9466, lng: 26.0303 },
  oradea: { name: 'Oradea', lat: 47.0722, lng: 21.9211 },
  sibiu: { name: 'Sibiu', lat: 45.7983, lng: 24.1255 },
  arad: { name: 'Arad', lat: 46.1866, lng: 21.3123 },
  pitesti: { name: 'Pitești', lat: 44.8606, lng: 24.8678 },
  bacau: { name: 'Bacău', lat: 46.5712, lng: 26.9293 },
  targu_mures: { name: 'Târgu Mureș', lat: 46.5425, lng: 24.5575 },
  'targu-mures': { name: 'Târgu Mureș', lat: 46.5425, lng: 24.5575 },
};

function normalize(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // strip diacritics
}

export function lookupCityCenter(rawCity: string | null | undefined): CityCenter | null {
  if (!rawCity) return null;
  const key = normalize(rawCity);
  if (!key) return null;
  // Try exact, then space-to-dash, then space-to-underscore so multi-word
  // names like "Cluj Napoca" / "Cluj-Napoca" / "cluj_napoca" all resolve.
  return (
    CITIES[key] ??
    CITIES[key.replace(/\s+/g, '-')] ??
    CITIES[key.replace(/\s+/g, '_')] ??
    null
  );
}
