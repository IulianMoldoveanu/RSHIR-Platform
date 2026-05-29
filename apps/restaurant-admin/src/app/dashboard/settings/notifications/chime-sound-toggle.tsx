'use client';

// P0 audit #15 — chime sound toggle UI. The toggle was implicit before:
// orders-realtime.tsx reads `localStorage.hir_admin_quiet === '1'` and
// suppresses the chime, but there was no surface to flip the flag.
//
// We keep the storage key (least invasive — preserves existing operator
// muscle memory in browser sessions that already set it manually) and add
// the explicit UI.
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'hir_admin_quiet';

function readQuiet(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function ChimeSoundToggle() {
  // `enabled` here means "chime ON", which is the opposite of the quiet
  // flag stored in localStorage. Hydration-safe: initial render uses the
  // false default, then the effect syncs to the persisted value.
  const [enabled, setEnabled] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setEnabled(!readQuiet());
    setMounted(true);
  }, []);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    try {
      if (next) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* private mode — best effort */
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-900">
            Sunet la comandă nouă
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            Redă un ton scurt în acest browser de fiecare dată când intră o
            comandă nouă. Setarea este per dispozitiv — fiecare tabletă /
            laptop o configurează separat.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Sunet la comandă nouă"
          onClick={toggle}
          disabled={!mounted}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            enabled ? 'bg-emerald-500' : 'bg-zinc-300'
          }`}
        >
          <span
            className={`absolute top-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
    </section>
  );
}
