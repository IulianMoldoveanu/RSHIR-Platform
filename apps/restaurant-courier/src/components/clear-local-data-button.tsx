'use client';

import { useState } from 'react';
import { Eraser } from 'lucide-react';
import { Button, toast } from '@hir/ui';

/**
 * Wipes every `hir-courier-*` LocalStorage entry and clears sessionStorage
 * keys we own, then reloads /dashboard. The Supabase auth session lives
 * under a `sb-*` prefix and is intentionally left untouched — the courier
 * stays logged in. Useful for:
 *   - troubleshooting weird stuck flags (onboarding, dismiss banners)
 *   - handing a shared device to another courier
 *   - exercising GDPR data-portability after a successful Art. 20 export
 *
 * Two-step confirm so a stray tap doesn't reset everything in one shot.
 */
export function ClearLocalDataButton() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  function clearAll() {
    setBusy(true);
    try {
      if (typeof localStorage !== 'undefined') {
        // Snapshot keys first — removing during iteration shifts the index.
        const toRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('hir-courier')) toRemove.push(key);
          // Also catch the legacy `hir.courier.*` keys (dot-separated) that
          // a couple of older components still use.
          else if (key && key.startsWith('hir.courier')) toRemove.push(key);
        }
        for (const k of toRemove) {
          try {
            localStorage.removeItem(k);
          } catch {
            // ignore quota/private mode
          }
        }
      }

      if (typeof sessionStorage !== 'undefined') {
        const toRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && (key.startsWith('hir-courier') || key.startsWith('hir:'))) {
            toRemove.push(key);
          }
        }
        for (const k of toRemove) {
          try {
            sessionStorage.removeItem(k);
          } catch {
            // ignore
          }
        }
      }

      toast.success('Datele locale au fost șterse.', { duration: 3_000 });
      window.setTimeout(() => {
        window.location.assign('/dashboard');
      }, 700);
    } catch {
      toast('Ștergerea a eșuat. Reîncearcă.', { duration: 4_000 });
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <Button
        onClick={() => setConfirming(true)}
        variant="outline"
        size="sm"
        className="min-h-[40px] gap-1.5 self-start rounded-lg border-rose-500/40 bg-rose-500/5 px-3 py-2 text-xs font-semibold text-rose-200 transition-all hover:-translate-y-px hover:border-rose-500/60 hover:bg-rose-500/10 hover:shadow-md hover:shadow-rose-500/15 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-rose-500 focus-visible:outline-offset-2"
      >
        <Eraser className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
        Șterge datele locale
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 ring-1 ring-inset ring-rose-500/20 shadow-sm shadow-rose-500/10">
      <p className="text-xs leading-relaxed text-rose-100">
        Vom șterge preferințele tale salvate pe acest telefon (notificări,
        ținte, documente memorizate, sloturi rezervate, etc.). Contul tău
        HIR rămâne intact și nu te dezautentificăm.
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          onClick={clearAll}
          variant="destructive"
          size="sm"
          disabled={busy}
          className="min-h-[40px] gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold shadow-md shadow-rose-600/30 transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-rose-600/40 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-rose-400 focus-visible:outline-offset-2 disabled:opacity-60 disabled:shadow-none disabled:hover:translate-y-0"
        >
          {busy ? 'Se șterge…' : 'Da, șterge'}
        </Button>
        <Button
          type="button"
          onClick={() => setConfirming(false)}
          variant="outline"
          size="sm"
          disabled={busy}
          className="min-h-[40px] rounded-lg border-hir-border bg-hir-surface px-4 py-2 text-xs font-medium text-hir-muted-fg transition-colors hover:border-hir-muted-fg/40 hover:bg-hir-border/60 hover:text-hir-fg focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
        >
          Anulează
        </Button>
      </div>
    </div>
  );
}
