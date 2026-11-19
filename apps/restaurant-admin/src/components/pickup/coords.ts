export type LatLng = { lat: number; lng: number };

/**
 * Parse the one thing people actually have in their clipboard: the
 * "45.6303406, 25.6234782" pair Google Maps copies on right-click. Also
 * accepts a space or semicolon separator, and a leading/trailing paren so a
 * pasted "(45.63, 25.62)" works.
 *
 * Returns null for anything else — out-of-range values included, so a
 * swapped pair that would land in the ocean is refused rather than saved.
 */
export function parseLatLng(raw: string): LatLng | null {
  const cleaned = raw.trim().replace(/^\(|\)$/g, '');
  const parts = cleaned.split(/[,;\s]+/).filter(Boolean);
  if (parts.length !== 2) return null;

  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/** Six decimals ≈ 11 cm — more than a doorway needs, and short enough to read. */
export function formatLatLng(p: LatLng): string {
  return `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;
}
