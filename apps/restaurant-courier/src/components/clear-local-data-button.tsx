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
        className="self-start"
      >
        <Eraser className="mr-2 h-4 w-4" aria-hidden />
        Șterge datele locale
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
      <p className="text-xs text-rose-100">
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
        >
          {busy ? 'Se șterge…' : 'Da, șterge'}
        </Button>
        <Button
          type="button"
          onClick={() => setConfirming(false)}
          variant="outline"
          size="sm"
          disabled={busy}
        >
          Anulează
        </Button>
      </div>
    </div>
  );
}
