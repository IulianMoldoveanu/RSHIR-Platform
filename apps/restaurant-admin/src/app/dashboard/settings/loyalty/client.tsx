'use client';

import { useState, useTransition } from 'react';
import { Button, toast } from '@hir/ui';
import { updateLoyaltySettings } from './actions';

type Settings = {
  is_enabled: boolean;
  points_per_ron: number;
  ron_per_point: number;
  min_points_to_redeem: number;
  max_redemption_pct: number;
  expiry_days: number;
  welcome_bonus_points: number;
};

export function LoyaltyClient({
  tenantId,
  initial,
}: {
  tenantId: string;
  initial: Settings;
}) {
  const [s, setS] = useState<Settings>(initial);
  const [saving, start] = useTransition();

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setS((prev) => ({ ...prev, [key]: value }));
  }

  function onSave() {
    start(async () => {
      const result = await updateLoyaltySettings({ tenantId, ...s });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Setări salvate.');
    });
  }

  // Compute a worked example so the operator knows what these numbers do.
  const exampleOrderRon = 100;
  const earnedExample = Math.floor(exampleOrderRon * s.points_per_ron);
  const ronEquivalent = (s.min_points_to_redeem * s.ron_per_point).toFixed(2);

  return (
    <div className="flex flex-col gap-4">
      {/* Toggle */}
      <div className="rounded-md border border-zinc-200 bg-white p-4">
        <label className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-zinc-900">
              Activează sistemul de loialitate
            </div>
            <div className="mt-0.5 text-xs text-zinc-500">
              Clienții vor vedea soldul de puncte și-l vor putea folosi la
              checkout după ce activezi.
            </div>
          </div>
          <input
            type="checkbox"
            className="h-5 w-5 accent-emerald-600"
            checked={s.is_enabled}
            onChange={(e) => update('is_enabled', e.target.checked)}
          />
        </label>
      </div>

      {/* Earning rate */}
      <div className="rounded-md border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Acumulare</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-zinc-700">Puncte per RON</span>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
              value={s.points_per_ron}
              onChange={(e) =>
                update('points_per_ron', Number(e.target.value) || 0)
              }
            />
            <span className="text-zinc-500">
              Implicit 0.2 pct/RON. La o comandă de {exampleOrderRon} RON →{' '}
              {earnedExample} puncte.
            </span>
          </label>

          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-zinc-700">
              Bonus de bun-venit (puncte)
            </span>
            <input
              type="number"
              min="0"
              max="100000"
              className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
              value={s.welcome_bonus_points}
              onChange={(e) =>
                update('welcome_bonus_points', Number(e.target.value) || 0)
              }
            />
            <span className="text-zinc-500">Acordat la prima comandă.</span>
          </label>
        </div>
      </div>

      {/* Redemption rate */}
      <div className="rounded-md border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Răscumpărare</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-zinc-700">RON per punct</span>
            <input
              type="number"
              step="0.01"
              min="0"
              max="10"
              className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
              value={s.ron_per_point}
              onChange={(e) =>
                update('ron_per_point', Number(e.target.value) || 0)
              }
            />
            <span className="text-zinc-500">Implicit 0.10 RON/pct.</span>
          </label>

          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-zinc-700">Prag minim puncte</span>
            <input
              type="number"
              min="1"
              max="100000"
              className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
              value={s.min_points_to_redeem}
              onChange={(e) =>
                update(
                  'min_points_to_redeem',
                  Math.max(1, Math.floor(Number(e.target.value) || 1)),
                )
              }
            />
            <span className="text-zinc-500">≈ {ronEquivalent} RON discount</span>
          </label>

          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-zinc-700">
              Discount maxim per comandă (%)
            </span>
            <input
              type="number"
              min="1"
              max="100"
              className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
              value={s.max_redemption_pct}
              onChange={(e) =>
                update(
                  'max_redemption_pct',
                  Math.max(
                    1,
                    Math.min(100, Math.floor(Number(e.target.value) || 1)),
                  ),
                )
              }
            />
            <span className="text-zinc-500">Limitează abuzul.</span>
          </label>
        </div>
      </div>

      {/* Expiry */}
      <div className="rounded-md border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Expirare</h2>
        <label className="mt-3 flex flex-col gap-1 text-xs sm:max-w-xs">
          <span className="font-medium text-zinc-700">Zile de inactivitate</span>
          <input
            type="number"
            min="0"
            max="3650"
            className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
            value={s.expiry_days}
            onChange={(e) =>
              update('expiry_days', Math.max(0, Math.floor(Number(e.target.value) || 0)))
            }
          />
          <span className="text-zinc-500">
            Punctele expiră după {s.expiry_days} zile fără activitate. 0 = nu
            expiră niciodată.
          </span>
        </label>
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={onSave} disabled={saving}>
          {saving ? 'Se salvează…' : 'Salvează setările'}
        </Button>
      </div>
    </div>
  );
}
