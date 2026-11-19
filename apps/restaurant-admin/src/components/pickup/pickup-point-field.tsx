'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { geocodePickupAddressAction } from './actions';
import { formatLatLng, parseLatLng, type LatLng } from './coords';

// Leaflet touches `window` at module scope, so the map can only load in the
// browser. Same dynamic/ssr:false shape as dashboard/zones/zones-client.tsx.
const PinMap = dynamic(() => import('./pin-map').then((m) => m.PinMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[300px] w-full items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
      Se încarcă harta…
    </div>
  ),
});

// Brașov — where the first tenants are. Only used to decide what the map
// shows before a pin exists; it is never saved as a coordinate.
const FALLBACK_CENTER: LatLng = { lat: 45.6579, lng: 25.6012 };

const GEOCODE_ERRORS: Record<string, string> = {
  unauthenticated: 'Sesiunea a expirat. Reîncarcă pagina.',
  rate_limited: 'Prea multe căutări. Așteaptă câteva secunde.',
  too_short: 'Scrie adresa completă (stradă, număr, oraș).',
  not_found: 'Nu am găsit adresa. Mută pinul pe hartă.',
};

export function PickupPointField({
  value,
  onChange,
  disabled = false,
  addressHint = '',
  cityCenter = null,
  height = 300,
}: {
  value: LatLng | null;
  onChange: (next: LatLng | null) => void;
  disabled?: boolean;
  /** Seeds the search box — the address already typed elsewhere in the form. */
  addressHint?: string;
  /** Where to open the map when there is no pin yet. */
  cityCenter?: LatLng | null;
  height?: number;
}) {
  const [query, setQuery] = useState(addressHint);
  const [coordText, setCoordText] = useState(value ? formatLatLng(value) : '');
  const [message, setMessage] = useState<string | null>(null);
  // A plain flag, not useTransition: on React 18 a transition ends at the
  // first await, so the button would have re-enabled itself while the
  // lookup was still in flight and a second click would have spent another
  // of the five allowed searches.
  const [searching, setSearching] = useState(false);

  // The address lookup is a network round-trip (up to 8s), and the wizard's
  // onChange closes over that render's draft to rebuild the whole
  // restaurantInfo object. Calling the captured callback when the answer
  // lands would spread a stale draft back over anything the operator typed
  // meanwhile — phone, address, city — and the wizard autosaves it.
  // Reading the callback out of a ref always hands the result to the
  // current draft. Same decoupling as zones/zone-map.tsx.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // One writer for both directions: whatever moves the pin (search, map
  // click, marker drag, pasted pair) also refreshes the text box, so the
  // two can never disagree about where the courier is being sent.
  function setPin(next: LatLng | null) {
    onChangeRef.current(next);
    setCoordText(next ? formatLatLng(next) : '');
  }

  function search() {
    const q = query.trim();
    if (!q || searching) return;
    setMessage(null);
    setSearching(true);
    void (async () => {
      try {
        const res = await geocodePickupAddressAction(q);
        if (!res.ok) {
          setMessage(GEOCODE_ERRORS[res.error] ?? 'Căutarea a eșuat.');
          return;
        }
        setPin({ lat: res.lat, lng: res.lng });
        setMessage(res.label ? `Găsit: ${res.label}` : null);
      } catch {
        setMessage('Căutarea a eșuat. Mută pinul pe hartă.');
      } finally {
        setSearching(false);
      }
    })();
  }

  function commitCoordText(raw: string) {
    if (raw.trim() === '') {
      setPin(null);
      setMessage(null);
      return;
    }
    const parsed = parseLatLng(raw);
    if (!parsed) {
      // Snap the box back to the pin that is actually saved. Leaving the
      // rejected text on screen was the one hole in the invariant above:
      // the host form does not know this edit failed, so Save would report
      // success while storing the previous pickup point — the operator
      // would be looking at coordinates that were never saved.
      setCoordText(value ? formatLatLng(value) : '');
      setMessage('Coordonate invalide, am păstrat pinul anterior. Format: 45.630341, 25.623478');
      return;
    }
    setPin(parsed);
    setMessage(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={query}
          disabled={disabled || searching}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // The field lives inside the Operations <form>; without this
              // the Enter key would submit the whole settings page instead
              // of running the lookup.
              e.preventDefault();
              search();
            }
          }}
          placeholder="Str. Republicii 12, Brașov"
          aria-label="Caută adresa punctului de ridicare"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="button"
          onClick={search}
          disabled={disabled || searching || query.trim() === ''}
          className="shrink-0 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {searching ? 'Caut…' : 'Caută pe hartă'}
        </button>
      </div>

      <PinMap
        value={value}
        onChange={setPin}
        disabled={disabled}
        initialCenter={value ?? cityCenter ?? FALLBACK_CENTER}
        height={height}
      />

      <p className="text-xs text-zinc-500">
        Click pe hartă pune pinul, iar pinul se poate trage cu mouse-ul. Aici ridică
        curierul comanda.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          inputMode="decimal"
          value={coordText}
          disabled={disabled}
          onChange={(e) => setCoordText(e.target.value)}
          onBlur={(e) => commitCoordText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitCoordText((e.target as HTMLInputElement).value);
            }
          }}
          placeholder="45.630341, 25.623478"
          aria-label="Coordonate punct de ridicare"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={() => {
              setPin(null);
              setMessage(null);
            }}
            className="shrink-0 rounded-md border border-zinc-300 px-3 py-2 text-xs text-zinc-700"
          >
            Șterge pinul
          </button>
        )}
      </div>

      {message && <p className="text-xs text-zinc-600">{message}</p>}

      {!value && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Fără pin nu știm de unde ridică curierul: comanda ajunge la flotă fără punct de
          plecare, iar distanța — deci și plata livrării — nu se poate calcula.
        </p>
      )}
    </div>
  );
}
