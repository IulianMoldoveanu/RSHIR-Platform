'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Button, EmptyState } from '@hir/ui';
import type {
  RealtimeChannel,
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
} from '@supabase/supabase-js';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { TiersCard } from './tiers-card';
import { lookupCityCenter } from './default-city-centers';
import type { Zone, Tier, Polygon, ZonePause } from './types';

const ZoneMap = dynamic(() => import('./zone-map').then((m) => m.ZoneMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[520px] items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
      Se încarcă harta…
    </div>
  ),
});

type Props = {
  tenantId: string;
  initialZones: Zone[];
  initialTiers: Tier[];
  initialPauses?: ZonePause[];
  tenantCenter: { lat: number; lng: number } | null;
  tenantCity?: string | null;
};

// Shape of tenant_zone_pauses row payload arriving over realtime. We only
// project the columns the UI's `ZonePause` row needs; extra columns sent
// by Postgres (paused_by, resumed_*, etc.) are ignored.
type ZonePauseRow = {
  id: string;
  tenant_id: string;
  zone_id: string;
  reason: string;
  paused_until: string | null;
  paused_at: string;
  paused_via: 'CONTROL_ROOM' | 'HEPY' | 'ADMIN';
  notes: string | null;
  resumed_at: string | null;
};

// Prefab pause reasons match the API + Hepy NL tool. Free text supported via the
// custom modal field. Order = frequency in the field per ops feedback.
const PAUSE_REASONS: { key: string; label: string }[] = [
  { key: 'lipsa_curier', label: 'Lipsă curier' },
  { key: 'furtuna', label: 'Vreme rea / furtună' },
  { key: 'sold_out', label: 'Sold out (rămas fără stoc)' },
  { key: 'manual', label: 'Alt motiv' },
];

const PAUSE_DURATIONS: { minutes: number; label: string }[] = [
  { minutes: 15, label: '15 min' },
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 oră' },
  { minutes: 0, label: 'Până dau eu drumul' },
];

function formatPauseEta(pause: ZonePause): string {
  if (!pause.paused_until) return 'manual';
  const eta = new Date(pause.paused_until);
  const mins = Math.max(0, Math.round((eta.getTime() - Date.now()) / 60_000));
  if (mins < 60) return `${mins} min`;
  return eta.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
}

// Polish 2026-05-06: build a closed 24-sided polygon approximating a circle
// of `radiusKm` around `center`. Used by the empty-state "default zone" CTA
// so a brand-new tenant gets a usable zone in one click instead of having
// to learn the polygon-drawing tool to ship their first delivery.
//
// Latitude is straight degrees (~111 km / deg). Longitude shrinks with
// cos(latitude). 24 vertices is a visually-smooth circle without bloating
// the GeoJSON payload.
function buildCirclePolygon(
  center: { lat: number; lng: number },
  radiusKm: number,
): Polygon {
  const SIDES = 24;
  const KM_PER_DEG_LAT = 111;
  const kmPerDegLng = 111 * Math.cos((center.lat * Math.PI) / 180);
  const ring: [number, number][] = [];
  for (let i = 0; i < SIDES; i++) {
    const angle = (2 * Math.PI * i) / SIDES;
    const dLat = (radiusKm / KM_PER_DEG_LAT) * Math.sin(angle);
    const dLng = (radiusKm / kmPerDegLng) * Math.cos(angle);
    ring.push([center.lng + dLng, center.lat + dLat]);
  }
  // Close the ring (GeoJSON requires first === last; min 4 points).
  ring.push(ring[0]);
  return { type: 'Polygon', coordinates: [ring] };
}

export function ZonesClient({
  tenantId,
  initialZones,
  initialTiers,
  initialPauses = [],
  tenantCenter,
  tenantCity,
}: Props) {
  const [zones, setZones] = useState<Zone[]>(initialZones);
  const [pauses, setPauses] = useState<ZonePause[]>(initialPauses);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftPolygon, setDraftPolygon] = useState<Polygon | null>(null);
  const [draftName, setDraftName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pauseModalZoneId, setPauseModalZoneId] = useState<string | null>(null);
  const [pauseReasonKey, setPauseReasonKey] = useState<string>(PAUSE_REASONS[0]!.key);
  const [pauseReasonCustom, setPauseReasonCustom] = useState('');
  const [pauseDurationMinutes, setPauseDurationMinutes] = useState<number>(
    PAUSE_DURATIONS[0]!.minutes,
  );
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const selected = zones.find((z) => z.id === selectedId) ?? null;
  const pauseForZone = (zoneId: string) => pauses.find((p) => p.zone_id === zoneId);
  const selectedPause = selected ? pauseForZone(selected.id) : undefined;

  // Realtime: keep `pauses` in sync with `tenant_zone_pauses` writes from
  // any other surface (HEPY chat, sibling tablet open in another tab, the
  // patron's phone). Without this, a pause set by Hepy in chat would only
  // appear after a manual page reload — defeating the "<1s propagation"
  // goal of the zone-pause feature. Mirrors apps/.../orders-realtime.tsx.
  //
  // INSERT: a new pause row → add to local state (replace any stale entry
  //   for the same zone, since a resume+repause cycle could leave one).
  // UPDATE: existing row mutated. The only mutation path we care about
  //   today is the resume (resumed_at flipped from NULL to a timestamp);
  //   when that happens, drop the row from the active list. If the row's
  //   `paused_until` was extended in place (not currently a UI path, but
  //   future), the row's `resumed_at` stays NULL and we keep showing it.
  useEffect(() => {
    if (!tenantId) return;
    const supabase = getBrowserSupabase();
    const channel: RealtimeChannel = supabase
      .channel(`tenant:${tenantId}:zone_pauses`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tenant_zone_pauses',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload: RealtimePostgresInsertPayload<ZonePauseRow>) => {
          const row = payload.new;
          if (!row || row.resumed_at) return;
          const projected: ZonePause = {
            id: row.id,
            zone_id: row.zone_id,
            reason: row.reason,
            paused_until: row.paused_until,
            paused_at: row.paused_at,
            paused_via: row.paused_via,
            notes: row.notes,
          };
          setPauses((prev) => [...prev.filter((p) => p.zone_id !== row.zone_id), projected]);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tenant_zone_pauses',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload: RealtimePostgresUpdatePayload<ZonePauseRow>) => {
          const row = payload.new;
          if (!row) return;
          // Resume = resumed_at flipped non-null. Drop from active list.
          if (row.resumed_at) {
            setPauses((prev) => prev.filter((p) => p.id !== row.id));
          }
        },
      )
      .subscribe((status: string) => {
        // After CHANNEL_ERROR / TIMED_OUT and a transparent client
        // reconnect, the channel re-subscribes — but any pauses written
        // while we were disconnected don't replay through the live
        // stream. On every SUBSCRIBED (initial + reconnect) re-read the
        // active-pauses view to reconcile missed writes. orders-realtime
        // uses router.refresh() because its UI is server-rendered; here
        // the pauses live in client state, so we hit the view directly.
        // (Codex PR #735 P2.)
        if (status === 'SUBSCRIBED') {
          void (async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sb = supabase as any;
            const { data, error } = await sb
              .from('tenant_zone_active_pauses')
              .select('id, zone_id, reason, paused_until, paused_at, paused_via, notes')
              .eq('tenant_id', tenantId);
            if (error) {
              console.warn('[zones-realtime] resync read failed:', error.message);
              return;
            }
            setPauses((data ?? []) as ZonePause[]);
          })();
          // Also invalidate the SSR page so the Insights card (server
          // component) and any sibling reads pick up the new state.
          router.refresh();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[zones-realtime] channel disrupted:', status);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tenantId, router]);

  async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Request failed (${res.status})`);
    }
    return (await res.json()) as T;
  }

  // Resolve a default circle center: prefer the tenant's pinned location
  // (set during onboarding), otherwise fall back to the city's centroid
  // from our hard-coded RO city table. If neither resolves, the CTA is
  // hidden — the operator must use the polygon tool the conventional way.
  const defaultCircle = (() => {
    if (tenantCenter) {
      return {
        center: tenantCenter,
        label: tenantCity?.trim() || 'restaurant',
      };
    }
    const cityHit = lookupCityCenter(tenantCity);
    if (cityHit) return { center: { lat: cityHit.lat, lng: cityHit.lng }, label: cityHit.name };
    return null;
  })();

  function seedDefaultZone() {
    if (!defaultCircle) return;
    setError(null);
    const polygon = buildCirclePolygon(defaultCircle.center, 5);
    const name = `Zonă implicită ${defaultCircle.label} (5 km)`;
    startTransition(async () => {
      try {
        const { zone } = await api<{ zone: Zone }>('/api/zones', {
          method: 'POST',
          body: JSON.stringify({ name, polygon, is_active: true }),
        });
        setZones((prev) => [...prev, zone]);
        setSelectedId(zone.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Salvarea zonei implicite a eșuat.');
      }
    });
  }

  function saveDraft() {
    if (!draftPolygon) {
      setError('Desenează un poligon înainte de a salva.');
      return;
    }
    if (!draftName.trim()) {
      setError('Adaugă un nume pentru zonă.');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const { zone } = await api<{ zone: Zone }>('/api/zones', {
          method: 'POST',
          body: JSON.stringify({ name: draftName.trim(), polygon: draftPolygon, is_active: true }),
        });
        setZones((prev) => [...prev, zone]);
        setDraftPolygon(null);
        setDraftName('');
        setSelectedId(zone.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Salvarea a eșuat.');
      }
    });
  }

  function updateZone(id: string, patch: Partial<Pick<Zone, 'name' | 'is_active'>>) {
    startTransition(async () => {
      try {
        const { zone } = await api<{ zone: Zone }>(`/api/zones/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
        setZones((prev) => prev.map((z) => (z.id === id ? zone : z)));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Actualizarea a eșuat.');
      }
    });
  }

  function openPauseModal(zoneId: string) {
    setError(null);
    setPauseModalZoneId(zoneId);
    setPauseReasonKey(PAUSE_REASONS[0]!.key);
    setPauseReasonCustom('');
    setPauseDurationMinutes(PAUSE_DURATIONS[0]!.minutes);
  }

  function submitPause() {
    const zoneId = pauseModalZoneId;
    if (!zoneId) return;
    const reason =
      pauseReasonKey === 'manual' && pauseReasonCustom.trim()
        ? pauseReasonCustom.trim()
        : pauseReasonKey;
    startTransition(async () => {
      try {
        const { pause } = await api<{ pause: ZonePause }>(`/api/zones/${zoneId}/pause`, {
          method: 'POST',
          body: JSON.stringify({
            reason,
            reason_preset: pauseReasonKey,
            duration_minutes: pauseDurationMinutes,
          }),
        });
        setPauses((prev) => [...prev.filter((p) => p.zone_id !== zoneId), pause]);
        setPauseModalZoneId(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Pauza nu s-a putut activa.');
      }
    });
  }

  function resumeZone(zoneId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await api(`/api/zones/${zoneId}/pause`, { method: 'DELETE' });
        setPauses((prev) => prev.filter((p) => p.zone_id !== zoneId));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Reluarea comenzilor a eșuat.');
      }
    });
  }

  function deleteZone(id: string) {
    if (!confirm('Ștergi această zonă?')) return;
    startTransition(async () => {
      try {
        await api(`/api/zones/${id}`, { method: 'DELETE' });
        setZones((prev) => prev.filter((z) => z.id !== id));
        if (selectedId === id) setSelectedId(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ștergerea a eșuat.');
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Sidebar */}
        <aside className="flex flex-col gap-3">
          <div className="rounded-md border border-zinc-200 bg-white p-3">
            <h2 className="mb-2 text-sm font-semibold text-zinc-800">Zone existente</h2>
            {zones.length === 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-zinc-500">
                  Nicio zonă încă. Folosiți unealta de poligon pe hartă pentru
                  a desena prima zonă.
                </p>
                {defaultCircle && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={seedDefaultZone}
                    disabled={isPending}
                    className="self-start"
                  >
                    {isPending
                      ? 'Se adaugă…'
                      : `Adaugă zonă implicită ${defaultCircle.label}, 5 km`}
                  </Button>
                )}
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {zones.map((z) => {
                  const pause = pauseForZone(z.id);
                  return (
                    <li key={z.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(z.id === selectedId ? null : z.id)}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${
                          selectedId === z.id
                            ? 'bg-zinc-900 text-white'
                            : 'text-zinc-700 hover:bg-zinc-100'
                        }`}
                      >
                        <span className="truncate">{z.name}</span>
                        {pause ? (
                          <span
                            className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                            aria-label={`Pauză activă: ${pause.reason}`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            Pauză
                          </span>
                        ) : (
                          <span
                            className={`ml-2 inline-block h-2 w-2 shrink-0 rounded-full ${
                              z.is_active ? 'bg-green-500' : 'bg-zinc-400'
                            }`}
                            aria-label={z.is_active ? 'Activă' : 'Inactivă'}
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {selected ? (
            <div className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-white p-3">
              <h3 className="text-sm font-semibold text-zinc-800">Detalii zonă</h3>
              <label className="text-xs text-zinc-600">
                Nume
                <input
                  className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm"
                  value={selected.name}
                  onChange={(e) =>
                    setZones((prev) =>
                      prev.map((z) => (z.id === selected.id ? { ...z, name: e.target.value } : z)),
                    )
                  }
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value.trim() !== selected.name) {
                      updateZone(selected.id, { name: e.target.value.trim() });
                    }
                  }}
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-600">
                <input
                  type="checkbox"
                  checked={selected.is_active}
                  onChange={(e) => updateZone(selected.id, { is_active: e.target.checked })}
                />
                Activă
              </label>

              {selectedPause ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                  <p className="font-semibold">Comenzi oprite din această zonă</p>
                  <p className="mt-0.5">Motiv: {selectedPause.reason}</p>
                  <p className="mt-0.5">Reluare: {formatPauseEta(selectedPause)}</p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => resumeZone(selected.id)}
                    disabled={isPending}
                    className="mt-2"
                  >
                    Reia comenzile
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openPauseModal(selected.id)}
                  disabled={isPending || !selected.is_active}
                  title={!selected.is_active ? 'Zona este oprită complet — activeaz-o întâi' : undefined}
                >
                  Pune pauză temporară
                </Button>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => deleteZone(selected.id)}
                disabled={isPending}
              >
                Șterge zona
              </Button>
            </div>
          ) : draftPolygon ? (
            <div className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-white p-3">
              <h3 className="text-sm font-semibold text-zinc-800">Salvare zonă nouă</h3>
              <label className="text-xs text-zinc-600">
                Nume
                <input
                  className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm"
                  placeholder="ex. Centru"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                />
              </label>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={saveDraft} disabled={isPending}>
                  Salvează
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDraftPolygon(null);
                    setDraftName('');
                  }}
                  disabled={isPending}
                >
                  Renunță
                </Button>
              </div>
            </div>
          ) : (
            <EmptyState
              title="Selectează o zonă"
              description="Click pe unealta de poligon din colțul stânga-sus al hărții pentru a desena o zonă nouă, sau alege una din lista de mai sus."
            />
          )}

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
              {error}
            </p>
          ) : null}
        </aside>

        {/* Map */}
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          <ZoneMap
            zones={zones}
            selectedId={selectedId}
            onSelect={setSelectedId}
            tenantCenter={tenantCenter}
            onPolygonDrawn={(polygon) => {
              setDraftPolygon(polygon);
              setSelectedId(null);
            }}
          />
        </div>
      </div>

      <TiersCard initialTiers={initialTiers} />

      {pauseModalZoneId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) setPauseModalZoneId(null);
          }}
        >
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h3 id="pause-modal-title" className="text-base font-semibold text-zinc-900">
              Oprește comenzile în zonă
            </h3>
            <p className="mt-1 text-xs text-zinc-600">
              Comenzile noi din această zonă vor fi blocate la checkout. Reluarea
              se face automat la finalul intervalului sau manual.
            </p>

            <div className="mt-4">
              <p className="text-xs font-medium text-zinc-700">De ce oprești?</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {PAUSE_REASONS.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setPauseReasonKey(r.key)}
                    className={`rounded-md border px-3 py-2 text-xs ${
                      pauseReasonKey === r.key
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {pauseReasonKey === 'manual' ? (
                <input
                  type="text"
                  placeholder="Scrie motivul (opțional)"
                  value={pauseReasonCustom}
                  onChange={(e) => setPauseReasonCustom(e.target.value)}
                  className="mt-2 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                  maxLength={200}
                />
              ) : null}
            </div>

            <div className="mt-4">
              <p className="text-xs font-medium text-zinc-700">Cât timp?</p>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {PAUSE_DURATIONS.map((d) => (
                  <button
                    key={d.minutes}
                    type="button"
                    onClick={() => setPauseDurationMinutes(d.minutes)}
                    className={`rounded-md border px-2 py-2 text-xs ${
                      pauseDurationMinutes === d.minutes
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPauseModalZoneId(null)}
                disabled={isPending}
              >
                Renunță
              </Button>
              <Button type="button" size="sm" onClick={submitPause} disabled={isPending}>
                {isPending ? 'Se aplică…' : 'Oprește comenzile'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
