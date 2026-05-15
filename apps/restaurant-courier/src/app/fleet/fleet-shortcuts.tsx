'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Keyboard } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@hir/ui';

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

  return (
    <Sheet open={helpOpen} onOpenChange={setHelpOpen}>
      <SheetContent side="bottom" className="bg-hir-surface border-hir-border text-hir-fg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-hir-fg">
            <Keyboard className="h-4 w-4 text-violet-300" aria-hidden />
            Comenzi rapide
          </SheetTitle>
        </SheetHeader>
        <div className="px-5 pb-5">
          <ul className="divide-y divide-hir-border">
            {SHORTCUTS.map((s) => (
              <li
                key={s.keys}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="text-hir-fg">{s.label}</span>
                <span className="flex gap-1">
                  {s.keys.split(' ').map((k, i) => (
                    <kbd
                      key={`${s.keys}-${i}`}
                      className="rounded-md border border-hir-border bg-zinc-950 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-hir-fg"
                    >
                      {k}
                    </kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-hir-muted-fg">
            Comenzile rapide sunt dezactivate când scrii într-un câmp.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
