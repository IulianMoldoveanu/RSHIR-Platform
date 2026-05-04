import { MapPin, Phone } from 'lucide-react';

/**
 * Two link buttons next to a pickup/dropoff address.
 *
 *   "Deschide în Maps" → `geo:lat,lng?q=address` (Android handles natively;
 *      iOS falls back to the Google Maps URL when the geo: scheme isn't
 *      claimed by an installed app).
 *
 * If lat/lng are missing we still render with just `q=` (geo will refuse
 * but the universal-link fallback still works).
 */
export function MapLink({
  address,
  lat,
  lng,
}: {
  address: string | null | undefined;
  lat: number | null | undefined;
  lng: number | null | undefined;
}) {
  const hasCoords = lat != null && lng != null;
  const q = encodeURIComponent(address ?? '');
  const geoHref = hasCoords ? `geo:${lat},${lng}?q=${q}` : null;
  const universalHref = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    : `https://www.google.com/maps/search/?api=1&query=${q}`;

  // Single anchor: prefer geo:, but most browsers will still open the
  // platform's chosen handler. We render universal-href as the primary
  // since geo: sometimes prompts an app picker dialog instead of opening.
  return (
    <a
      href={geoHref ?? universalHref}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/20"
    >
      <MapPin className="h-3.5 w-3.5" aria-hidden />
      Deschide în Maps
    </a>
  );
}

// Display formatter for RO mobile numbers — "+40732128199" → "+40 732 128 199".
// Falls back to the raw string for non-RO or short numbers. The tel: href
// keeps the raw E.164 to avoid breaking the dialer on any platform.
function formatRoPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+40') && digits.length === 12) {
    return `+40 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9, 12)}`;
  }
  if (digits.startsWith('07') && digits.length === 10) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 10)}`;
  }
  return phone;
}

export function PhoneLink({ phone }: { phone: string | null | undefined }) {
  if (!phone) return null;
  const display = formatRoPhone(phone);
  return (
    <a
      href={`tel:${phone}`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20"
    >
      <Phone className="h-3.5 w-3.5" aria-hidden />
      {display}
    </a>
  );
}
