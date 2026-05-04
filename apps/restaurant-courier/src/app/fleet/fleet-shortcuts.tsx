'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Keyboard, X } from 'lucide-react';

type Shortcut = { keys: string; label: string };

const SHORTCUTS: Shortcut[] = [
  { keys: 'g h', label: 'Privire de ansamblu' },
  { keys: 'g o', label: 'Comenzi' },
  { keys: 'g c', label: 'Curieri' },
  { keys: 'g e', label: 'Decontări' },
  { keys: 'g s', label: 'Setări' },
  { keys: 'i', label: 'Invită curier' },
  { keys: '/', label: 'Focus pe căutare' },
  { keys: '?', label: 'Acest panou' },
];

const PATHS: Record<string, string> = {
  h: '/fleet',
  o: '/fleet/orders',
  c: '/fleet/couriers',
  e: '/fleet/earnings',
  s: '/fleet/settings',
};

/**
 * Keyboard shortcuts for the fleet dashboard. Mounted in the layout so
 * it works on every /fleet/* route. Two-key g-prefix navigation matches
 * the GitHub / Linear convention managers are likely to recognize.
 *
 * Suppresses key handling while focus is inside an input/textarea/select
 * so typing into the search box (or settings form, or note editor) doesn't
 * trigger navigation. `?` opens a help overlay; Escape closes it.
 */
export function FleetShortcuts() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    let gPending = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;

    function isFormElement(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (el.isContentEditable) return true;
      return false;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Escape closes the help overlay regardless of focus context.
      if (e.key === 'Escape' && helpOpen) {
        setHelpOpen(false);
        e.preventDefault();
        return;
      }

      if (isFormElement(e.target)) return;

      // `?` opens help. The browser fires `?` as Shift+`/` on most layouts,
      // but the resolved e.key === '?' is reliable.
      if (e.key === '?') {
        setHelpOpen((v) => !v);
        e.preventDefault();
        return;
      }

      // `/` focuses the search input on /fleet/orders if present.
      if (e.key === '/') {
        const search = document.querySelector<HTMLInputElement>(
          'input[type="search"][aria-label="Caută în comenzi"]',
        );
        if (search) {
          e.preventDefault();
          search.focus();
          search.select();
        }
        return;
      }

      // `i` jumps to invite.
      if (e.key === 'i' && !gPending) {
        e.preventDefault();
        router.push('/fleet/couriers/invite');
        return;
      }

      // g-prefix navigation: press g, then a destination letter within 1.2s.
      if (e.key === 'g' && !gPending) {
        gPending = true;
        gTimer = setTimeout(() => {
          gPending = false;
        }, 1200);
        return;
      }

      if (gPending) {
        const target = PATHS[e.key];
        gPending = false;
        if (gTimer) {
          clearTimeout(gTimer);
          gTimer = null;
        }
        if (target) {
          e.preventDefault();
          router.push(target);
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (gTimer) clearTimeout(gTimer);
    };
  }, [router, helpOpen]);

  if (!helpOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={() => setHelpOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Comenzi rapide tastatură"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Keyboard className="h-4 w-4 text-violet-300" aria-hidden />
            Comenzi rapide
          </h2>
          <button
            type="button"
            onClick={() => setHelpOpen(false)}
            aria-label="Închide"
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <ul className="divide-y divide-zinc-800">
          {SHORTCUTS.map((s) => (
            <li
              key={s.keys}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <span className="text-zinc-300">{s.label}</span>
              <span className="flex gap-1">
                {s.keys.split(' ').map((k, i) => (
                  <kbd
                    key={`${s.keys}-${i}`}
                    className="rounded-md border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-200"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-zinc-500">
          Comenzile rapide sunt dezactivate când scrii într-un câmp.
        </p>
      </div>
    </div>
  );
}
