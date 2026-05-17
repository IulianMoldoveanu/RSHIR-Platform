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
import { cardClasses } from './card';

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
      <div className={cardClasses()}>
        <div className="h-6 w-48 animate-pulse rounded bg-hir-muted" />
      </div>
    );
  }

  return (
    <div className={cardClasses({ className: 'flex flex-col gap-3' })}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 ring-1 ring-violet-500/30"
        >
          <Zap className="h-4 w-4 text-violet-300" strokeWidth={2.25} />
        </span>
        <div className="flex flex-1 flex-col gap-1">
          <label
            htmlFor={toggleId}
            className="cursor-pointer text-sm font-semibold text-hir-fg"
          >
            Acceptare automată comenzi
          </label>
          <p className="text-xs leading-relaxed text-hir-muted-fg">
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
          className="mt-1 h-5 w-5 cursor-pointer accent-violet-500 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
        />
      </div>

      {enabled ? (
        <>
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 ring-1 ring-inset ring-amber-500/20">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-300"
              aria-hidden
              strokeWidth={2.25}
            />
            <span className="leading-relaxed">
              Activ — comenzile compatibile se vor accepta singure. Verifică
              detaliile imediat după notificare.
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <label
                htmlFor={sliderId}
                className="text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg"
              >
                Maxim până la punctul de preluare
              </label>
              <span className="text-sm font-bold tabular-nums text-violet-200">
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
              className="h-2 w-full cursor-pointer accent-violet-500 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
              aria-valuemin={MIN_RADIUS_KM}
              aria-valuemax={MAX_RADIUS_KM}
              aria-valuenow={radius}
            />
            <div className="flex justify-between text-[11px] tabular-nums text-hir-muted-fg">
              <span>{MIN_RADIUS_KM} km</span>
              <span>{MAX_RADIUS_KM} km</span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
