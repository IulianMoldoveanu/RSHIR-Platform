'use client';

import { useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { Button, EmptyState } from '@hir/ui';
import { TiersCard } from './tiers-card';
import type { Zone, Tier, Polygon } from './types';

const ZoneMap = dynamic(() => import('./zone-map').then((m) => m.ZoneMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[520px] items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
      Se încarcă harta…
    </div>
  ),
});

type Props = {
  initialZones: Zone[];
  initialTiers: Tier[];
  tenantCenter: { lat: number; lng: number } | null;
};

export function ZonesClient({ initialZones, initialTiers, tenantCenter }: Props) {
  const [zones, setZones] = useState<Zone[]>(initialZones);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftPolygon, setDraftPolygon] = useState<Polygon | null>(null);
  const [draftName, setDraftName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = zones.find((z) => z.id === selectedId) ?? null;

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
              <p className="text-xs text-zinc-500">
                Nicio zonă încă. Folosește unealta de poligon pe hartă pentru a desena prima zonă.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {zones.map((z) => (
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
                      <span
                        className={`ml-2 inline-block h-2 w-2 shrink-0 rounded-full ${
                          z.is_active ? 'bg-green-500' : 'bg-zinc-400'
                        }`}
                        aria-label={z.is_active ? 'Activă' : 'Inactivă'}
                      />
                    </button>
                  </li>
                ))}
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
    </div>
  );
}
