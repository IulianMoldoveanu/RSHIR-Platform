'use client';

import { useEffect, useState } from 'react';
import { Check, RefreshCw, X } from 'lucide-react';
import { Button, toast } from '@hir/ui';
import { cardClasses } from './card';

type Check = {
  id: string;
  label: string;
  pass: boolean | null;
  detail: string;
};

/**
 * Client-side device diagnostics for the courier. Runs a series of
 * lightweight feature checks so the courier (or whoever is helping them)
 * can see at a glance what the app + device support.
 *
 * No PII collected; all reads are synchronous browser API queries with
 * the GPS check intentionally optional (gated behind a user button so the
 * permission prompt isn't fired on page load).
 */
export function DiagnosticsPanel({ appVersion }: { appVersion: string }) {
  const [checks, setChecks] = useState<Check[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [gpsBusy, setGpsBusy] = useState(false);

  useEffect(() => {
    const list: Check[] = [];

    // Service worker
    list.push({
      id: 'sw',
      label: 'Service worker',
      pass: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
      detail:
        typeof navigator !== 'undefined' && 'serviceWorker' in navigator
          ? 'Suportat'
          : 'Indisponibil pe acest browser',
    });

    // Notifications API
    const notifSupported = typeof window !== 'undefined' && 'Notification' in window;
    list.push({
      id: 'notif',
      label: 'Notificări',
      pass: notifSupported ? Notification.permission === 'granted' : false,
      detail: notifSupported
        ? `Permisiune: ${Notification.permission}`
        : 'Indisponibil pe acest browser',
    });

    // Geolocation
    list.push({
      id: 'geo',
      label: 'Geolocație',
      pass: typeof navigator !== 'undefined' && 'geolocation' in navigator,
      detail:
        typeof navigator !== 'undefined' && 'geolocation' in navigator
          ? 'API disponibil — testează butonul de mai jos'
          : 'Indisponibil',
    });

    // Online status
    list.push({
      id: 'online',
      label: 'Internet',
      pass: typeof navigator !== 'undefined' ? navigator.onLine : null,
      detail:
        typeof navigator !== 'undefined' && navigator.onLine
          ? 'Online'
          : 'Offline (acțiunile se sincronizează când revii online)',
    });

    // Connection quality (effectiveType)
    type Conn = { effectiveType?: string };
    const conn =
      typeof navigator !== 'undefined'
        ? ((navigator as unknown as { connection?: Conn }).connection ?? null)
        : null;
    if (conn?.effectiveType) {
      const fast = conn.effectiveType === '4g' || conn.effectiveType === '5g';
      list.push({
        id: 'conn-type',
        label: 'Tipul conexiunii',
        pass: fast,
        detail: conn.effectiveType.toUpperCase(),
      });
    }

    // Battery API
    if (
      typeof navigator !== 'undefined' &&
      'getBattery' in navigator
    ) {
      list.push({
        id: 'battery',
        label: 'API baterie',
        pass: true,
        detail: 'Suportat — vezi pilula din header pentru detalii',
      });
    } else {
      list.push({
        id: 'battery',
        label: 'API baterie',
        pass: false,
        detail: 'Indisponibil pe acest browser (Safari / Firefox)',
      });
    }

    // Web Audio
    list.push({
      id: 'audio',
      label: 'Sunet ofertă (Web Audio)',
      pass:
        typeof window !== 'undefined' &&
        ('AudioContext' in window ||
          'webkitAudioContext' in (window as unknown as Record<string, unknown>)),
      detail:
        typeof window !== 'undefined' &&
        ('AudioContext' in window ||
          'webkitAudioContext' in (window as unknown as Record<string, unknown>))
          ? 'Suportat'
          : 'Indisponibil',
    });

    // Web Share
    list.push({
      id: 'share',
      label: 'Partajare nativă',
      pass:
        typeof navigator !== 'undefined' && typeof navigator.share === 'function',
      detail:
        typeof navigator !== 'undefined' && typeof navigator.share === 'function'
          ? 'Suportat'
          : 'Fallback prin clipboard',
    });

    // Speech synthesis (voice nav)
    list.push({
      id: 'tts',
      label: 'Voce română (Web Speech)',
      pass: typeof window !== 'undefined' && 'speechSynthesis' in window,
      detail:
        typeof window !== 'undefined' && 'speechSynthesis' in window
          ? 'Suportat — vezi „Notificări vocale" în setări'
          : 'Indisponibil',
    });

    // LocalStorage usage — sum the byte length of every key we own
    // (hir-courier-*). Helps the courier (or support) see if a runaway
    // queue or stuck cache is hogging device storage. Safari Private mode
    // pretends the storage works but caps quota aggressively.
    if (typeof localStorage !== 'undefined') {
      let bytes = 0;
      let count = 0;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || (!key.startsWith('hir-courier') && !key.startsWith('hir.courier'))) {
            continue;
          }
          count += 1;
          const raw = localStorage.getItem(key) ?? '';
          // UTF-16 in-browser strings; bytes here are an upper bound for
          // most ASCII / Romanian content — close enough for diagnostics.
          bytes += key.length + raw.length;
        }
      } catch {
        // Some browsers throw on iterating in private mode.
      }
      const kb = (bytes / 1024).toFixed(1);
      list.push({
        id: 'storage',
        label: 'Date locale',
        pass: bytes < 1024 * 1024, // > 1 MB warrants attention
        detail:
          count === 0
            ? 'Nicio preferință salvată'
            : `${count} chei · aproximativ ${kb} KB salvați pe acest dispozitiv`,
      });
    }

    setChecks(list);
  }, [refreshKey]);

  function testGps() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast('Geolocație indisponibilă.', { duration: 4_000 });
      return;
    }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsBusy(false);
        const acc = Math.round(pos.coords.accuracy);
        toast.success(`GPS OK — acuratețe ~${acc} m`, { duration: 5_000 });
      },
      (err) => {
        setGpsBusy(false);
        const reason =
          err.code === err.PERMISSION_DENIED
            ? 'Permisiunea refuzată'
            : err.code === err.POSITION_UNAVAILABLE
              ? 'Poziție indisponibilă'
              : err.code === err.TIMEOUT
                ? 'Timeout'
                : 'Eroare necunoscută';
        toast(`Test GPS: ${reason}`, { duration: 5_000 });
      },
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 0 },
    );
  }

  const userAgent =
    typeof navigator !== 'undefined' ? navigator.userAgent : 'necunoscut';

  // Verdict summary: count passes / fails / unknowns. Drives the top
  // chip so the courier sees "Totul ok" or "2 atentionari" without
  // scrolling the whole list.
  const verdict = checks.reduce(
    (acc, c) => {
      if (c.pass === true) acc.pass += 1;
      else if (c.pass === false) acc.fail += 1;
      else acc.unknown += 1;
      return acc;
    },
    { pass: 0, fail: 0, unknown: 0 },
  );
  const verdictTone =
    verdict.fail === 0
      ? {
          ring: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
          label: verdict.pass === 0 ? 'Verificare în curs…' : `Totul în regulă · ${verdict.pass} verificări OK`,
        }
      : {
          ring: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
          label: `${verdict.fail} ${verdict.fail === 1 ? 'atenționare' : 'atenționări'} · ${verdict.pass} verificări OK`,
        };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${verdictTone.ring}`}
        >
          {verdictTone.label}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setRefreshKey((k) => k + 1)}
          aria-label="Reîmprospătează verificările"
          className="-mr-2"
        >
          <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden />
          Reîncearcă
        </Button>
      </header>

      <ul className={cardClasses({ padding: 'none', className: 'divide-y divide-hir-border/60' })}>
        {checks.map((c) => {
          const Icon = c.pass === true ? Check : c.pass === false ? X : RefreshCw;
          const tone =
            c.pass === true
              ? {
                  bg: 'bg-emerald-500/15 ring-1 ring-emerald-500/30',
                  fg: 'text-emerald-300',
                }
              : c.pass === false
                ? {
                    bg: 'bg-rose-500/15 ring-1 ring-rose-500/30',
                    fg: 'text-rose-300',
                  }
                : {
                    bg: 'bg-hir-border',
                    fg: 'text-hir-muted-fg',
                  };
          return (
            <li key={c.id} className="flex items-start gap-3 px-4 py-3">
              <span
                aria-hidden
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone.bg}`}
              >
                <Icon className={`h-4 w-4 ${tone.fg}`} strokeWidth={c.pass === true ? 3 : 2.5} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-hir-fg">{c.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-hir-muted-fg">
                  {c.detail}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <Button
        type="button"
        onClick={testGps}
        disabled={gpsBusy}
        className="self-start gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 transition-all hover:bg-violet-500 hover:shadow-violet-500/40 active:scale-[0.98] disabled:opacity-60 disabled:shadow-none"
      >
        <RefreshCw className={`h-4 w-4 ${gpsBusy ? 'animate-spin' : ''}`} aria-hidden />
        {gpsBusy ? 'Se citește poziția…' : 'Testează GPS'}
      </Button>

      <section className={cardClasses({ className: 'text-xs' })}>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
          Versiune & dispozitiv
        </p>
        <dl className="space-y-1.5">
          <div className="flex justify-between gap-3">
            <dt className="text-hir-muted-fg">HIR Curier</dt>
            <dd className="font-mono tabular-nums text-hir-fg">{appVersion}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-hir-muted-fg">User agent</dt>
            <dd className="truncate font-mono text-[11px] text-hir-fg">{userAgent}</dd>
          </div>
        </dl>
      </section>

      <p className="text-[11px] leading-relaxed text-hir-muted-fg">
        Aceste verificări nu trimit nimic către server. Sunt doar pentru
        diagnosticul tău local.
      </p>
    </div>
  );
}
