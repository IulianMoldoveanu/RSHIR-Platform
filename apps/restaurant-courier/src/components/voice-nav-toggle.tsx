'use client';

import { useEffect, useId, useState } from 'react';
import { Mic, Volume2 } from 'lucide-react';
import { Button } from '@hir/ui';
import { isVoiceNavEnabled, setVoiceNavEnabled, speak } from '@/lib/voice-nav';
import { cardClasses } from './card';

export function VoiceNavToggle() {
  const id = useId();
  const [enabled, setEnabled] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setEnabled(isVoiceNavEnabled());
    setHydrated(true);
  }, []);

  function onToggle(next: boolean) {
    setEnabled(next);
    setVoiceNavEnabled(next);
    if (next) speak('Notificări vocale activate.');
  }

  function onTest() {
    speak('Test reușit. Voce activă în limba română.');
  }

  if (!hydrated) {
    return (
      <div className={cardClasses()}>
        <div className="h-6 w-40 animate-pulse rounded bg-hir-muted" />
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
          <Mic className="h-4 w-4 text-violet-300" strokeWidth={2.25} />
        </span>
        <div className="flex flex-1 flex-col gap-1">
          <label
            htmlFor={id}
            className="cursor-pointer text-sm font-semibold text-hir-fg"
          >
            Notificări vocale în deplasare
          </label>
          <p className="text-xs leading-relaxed text-hir-muted-fg">
            Citirea instrucțiunilor cu voce tare în limba română (apropiere
            restaurant, sosire la client, schimbări de stare).
          </p>
        </div>
        <input
          id={id}
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-1 h-5 w-5 cursor-pointer accent-violet-500 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
        />
      </div>

      {enabled ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onTest}
          className="self-start rounded-lg border-hir-border transition-colors hover:border-violet-500/40 hover:bg-violet-500/5 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
        >
          <Volume2 className="mr-2 h-4 w-4" aria-hidden strokeWidth={2.25} />
          Test voce
        </Button>
      ) : null}
    </div>
  );
}
