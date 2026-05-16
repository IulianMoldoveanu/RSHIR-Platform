'use client';

import { useEffect, useId, useState } from 'react';
import { AlertTriangle, Zap } from 'lucide-react';
import {
  DEFAULT_RADIUS_KM,
  MAX_RADIUS_KM,
  MIN_RADIUS_KM,
  clampRadius,
  getAutoAcceptRadiusKm,
  isAutoAcceptEnabled,
  setAutoAcceptEnabled,
  setAutoAcceptRadiusKm,
} from '@/lib/auto-accept';

export function AutoAcceptToggle() {
  const toggleId = useId();
  const sliderId = useId();
  const [enabled, setEnabled] = useState(false);
  const [radius, setRadius] = useState(DEFAULT_RADIUS_KM);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setEnabled(isAutoAcceptEnabled());
    setRadius(getAutoAcceptRadiusKm());
    setHydrated(true);
  }, []);

  function onToggle(next: boolean) {
    setEnabled(next);
    setAutoAcceptEnabled(next);
  }

  function onRadius(next: number) {
    const clamped = clampRadius(next);
    setRadius(clamped);
    setAutoAcceptRadiusKm(clamped);
  }

  if (!hydrated) {
    return (
      <div className="rounded-2xl border border-hir-border bg-hir-surface p-4">
        <div className="h-6 w-48 animate-pulse rounded bg-hir-muted" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-hir-border bg-hir-surface p-4">
      <div className="flex items-start gap-3">
        <Zap className="mt-1 h-5 w-5 shrink-0 text-violet-400" aria-hidden />
        <div className="flex flex-1 flex-col gap-1">
          <label
            htmlFor={toggleId}
            className="cursor-pointer text-sm font-semibold text-hir-fg"
          >
            Acceptare automată comenzi
          </label>
          <p className="text-xs text-hir-muted-fg">
            Acceptă automat comenzile compatibile cu modul tău curent, dacă
            punctul de preluare este în raza configurată mai jos. Poți
            dezactiva oricând.
          </p>
        </div>
        <input
          id={toggleId}
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-1 h-5 w-5 accent-hir-accent"
        />
      </div>

      {enabled ? (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            <span>
              Activ — comenzile compatibile se vor accepta singure. Verifică
              detaliile imediat după notificare.
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <label
                htmlFor={sliderId}
                className="text-xs font-medium text-hir-muted-fg"
              >
                Doar dacă punctul de preluare e la maxim
              </label>
              <span className="text-sm font-semibold text-violet-300">
                {radius} km
              </span>
            </div>
            <input
              id={sliderId}
              type="range"
              min={MIN_RADIUS_KM}
              max={MAX_RADIUS_KM}
              step={1}
              value={radius}
              onChange={(e) => onRadius(Number(e.target.value))}
              className="h-2 w-full cursor-pointer accent-hir-accent"
              aria-valuemin={MIN_RADIUS_KM}
              aria-valuemax={MAX_RADIUS_KM}
              aria-valuenow={radius}
            />
            <div className="flex justify-between text-[10px] text-hir-muted-fg">
              <span>{MIN_RADIUS_KM} km</span>
              <span>{MAX_RADIUS_KM} km</span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
