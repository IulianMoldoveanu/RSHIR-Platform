'use client';

import { useEffect, useId, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@hir/ui';
import {
  isOfferSoundEnabled,
  playOfferChirp,
  setOfferSoundEnabled,
} from '@/lib/offer-sound';

/**
 * Toggle + audition button for the "sunet la ofertă" preference.
 * Saved to LocalStorage (`hir-courier-offer-sound`); default ON.
 */
export function OfferSoundToggle() {
  const id = useId();
  const [enabled, setEnabled] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setEnabled(isOfferSoundEnabled());
    setHydrated(true);
  }, []);

  function onToggle(v: boolean) {
    setEnabled(v);
    setOfferSoundEnabled(v);
    // Audition on enable so the user hears what they just turned on.
    if (v) playOfferChirp();
  }

  function onAudition() {
    playOfferChirp();
  }

  if (!hydrated) {
    return (
      <div className="rounded-2xl border border-hir-border bg-hir-surface p-4">
        <div className="h-6 w-40 animate-pulse rounded bg-hir-muted" />
      </div>
    );
  }

  const Icon = enabled ? Volume2 : VolumeX;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-hir-border bg-hir-surface p-4">
      <div className="flex items-start gap-3">
        <Icon className="mt-1 h-5 w-5 shrink-0 text-violet-400" aria-hidden />
        <div className="flex flex-1 flex-col gap-1">
          <label
            htmlFor={id}
            className="cursor-pointer text-sm font-semibold text-hir-fg"
          >
            Sunet la ofertă nouă
          </label>
          <p className="text-xs text-hir-muted-fg">
            Un semnal scurt de două tonuri (E5→A5) când apare o comandă
            nouă. Distinct de sunetul standard al telefonului.
          </p>
        </div>
        <input
          id={id}
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-1 h-5 w-5 accent-hir-accent"
        />
      </div>

      {enabled ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onAudition}
          className="self-start"
        >
          <Volume2 className="mr-2 h-4 w-4" aria-hidden />
          Test sunet
        </Button>
      ) : null}
    </div>
  );
}
