'use client';

import { useState, useTransition } from 'react';
import { Button } from '@hir/ui';
import type { Tier } from './types';

type Props = { initialTiers: Tier[] };

type DraftTier = { min_km: string; max_km: string; price_ron: string };

const EMPTY_DRAFT: DraftTier = { min_km: '', max_km: '', price_ron: '' };

export function TiersCard({ initialTiers }: Props) {
  const [tiers, setTiers] = useState<Tier[]>(initialTiers);
  const [draft, setDraft] = useState<DraftTier>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function validateNew(min: number, max: number): string | null {
    if (!Number.isFinite(min) || min < 0) return 'min_km trebuie să fie un număr ≥ 0.';
    if (!Number.isFinite(max) || max <= min) return 'max_km trebuie să fie mai mare decât min_km.';
    const overlaps = tiers.some((t) => min < t.max_km && max > t.min_km);
    if (overlaps) return 'Intervalul se suprapune cu un tier existent.';
    return null;
  }

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

  function addTier() {
    const min = Number(draft.min_km);
    const max = Number(draft.max_km);
    const price = Number(draft.price_ron);
    const err = validateNew(min, max);
    if (err) {
      setError(err);
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError('Prețul trebuie să fie un număr ≥ 0.');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const { tier } = await api<{ tier: Tier }>('/api/zones/tiers', {
          method: 'POST',
          body: JSON.stringify({ min_km: min, max_km: max, price_ron: price }),
        });
        setTiers((prev) => [...prev, tier].sort((a, b) => a.min_km - b.min_km));
        setDraft(EMPTY_DRAFT);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Adăugarea a eșuat.');
      }
    });
  }

  function deleteTier(id: string) {
    if (!confirm('Ștergi acest tier?')) return;
    startTransition(async () => {
      try {
        await api(`/api/zones/tiers/${id}`, { method: 'DELETE' });
        setTiers((prev) => prev.filter((t) => t.id !== id));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ștergerea a eșuat.');
      }
    });
  }

  function updatePrice(id: string, value: number) {
    startTransition(async () => {
      try {
        const { tier } = await api<{ tier: Tier }>(`/api/zones/tiers/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ price_ron: value }),
        });
        setTiers((prev) => prev.map((t) => (t.id === id ? tier : t)));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Actualizarea prețului a eșuat.');
      }
    });
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-zinc-800">Tarife livrare după distanță</h2>
        <p className="text-xs text-zinc-500">
          Definește intervale de km și prețul aplicabil. Intervalele nu se pot suprapune.
        </p>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
            <th className="py-2 text-left font-medium">Min km</th>
            <th className="py-2 text-left font-medium">Max km</th>
            <th className="py-2 text-left font-medium">Preț (RON)</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {tiers.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-4 text-center text-xs text-zinc-500">
                Niciun tier definit. Toate comenzile vor avea livrare 0 RON.
              </td>
            </tr>
          ) : (
            tiers.map((t) => (
              <tr key={t.id} className="border-b border-zinc-100">
                <td className="py-2 text-zinc-700">{Number(t.min_km).toFixed(2)}</td>
                <td className="py-2 text-zinc-700">{Number(t.max_km).toFixed(2)}</td>
                <td className="py-2">
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    defaultValue={Number(t.price_ron).toFixed(2)}
                    className="w-24 rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm"
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v >= 0 && v !== Number(t.price_ron)) {
                        updatePrice(t.id, v);
                      }
                    }}
                  />
                </td>
                <td className="py-2 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteTier(t.id)}
                    disabled={isPending}
                  >
                    Șterge
                  </Button>
                </td>
              </tr>
            ))
          )}

          {/* Inline add row */}
          <tr>
            <td className="py-2 pr-2">
              <input
                type="number"
                step="0.01"
                min={0}
                placeholder="0.00"
                value={draft.min_km}
                onChange={(e) => setDraft({ ...draft, min_km: e.target.value })}
                className="w-24 rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm"
              />
            </td>
            <td className="py-2 pr-2">
              <input
                type="number"
                step="0.01"
                min={0}
                placeholder="3.00"
                value={draft.max_km}
                onChange={(e) => setDraft({ ...draft, max_km: e.target.value })}
                className="w-24 rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm"
              />
            </td>
            <td className="py-2 pr-2">
              <input
                type="number"
                step="0.01"
                min={0}
                placeholder="10.00"
                value={draft.price_ron}
                onChange={(e) => setDraft({ ...draft, price_ron: e.target.value })}
                className="w-24 rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm"
              />
            </td>
            <td className="py-2 text-right">
              <Button type="button" size="sm" onClick={addTier} disabled={isPending}>
                Adaugă tier
              </Button>
            </td>
          </tr>
        </tbody>
      </table>

      {error ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
