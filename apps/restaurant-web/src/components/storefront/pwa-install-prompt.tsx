'use client';
import { useEffect, useRef, useState } from 'react';

// Chrome/Android fires this before the browser shows its own install UI.
// iOS Safari does NOT fire this event — we detect it separately via UA.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'hir_pwa_dismissed_until';
const DISMISS_DAYS = 14;

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() < Number(raw);
  } catch {
    return false;
  }
}

function dismiss(): void {
  try {
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, String(until));
  } catch {
    // localStorage blocked (private mode on some browsers) — silently ignore.
  }
}

// Detect iOS Safari: no `beforeinstallprompt`, but can be added to home screen
// via Share → Add to Home Screen. We show a manual instruction toast instead.
// Criterion: iOS device running Safari (not Chrome/Firefox/etc. on iOS which
// all use WebKit but don't support the Add to Home Screen flow from our prompt).
function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  // Safari on iOS sets "Safari" in UA; Chrome/Firefox/Edge set their own name
  const isSafari = /safari/i.test(ua) && !/chrome|chromium|crios|fxios|edgios/i.test(ua);
  return isIos && isSafari;
}

// Returns true when the app is already installed (running in standalone mode).
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches;
}

export function PwaInstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Don't show if already installed or already dismissed.
    if (isStandalone() || isDismissed()) return;

    const ios = isIosSafari();
    setIsIos(ios);

    if (!ios) {
      // Chrome/Android: capture the beforeinstallprompt event.
      const handler = (e: Event) => {
        e.preventDefault();
        deferredPrompt.current = e as BeforeInstallPromptEvent;
        // Show our prompt after a 30s delay so the user has had time to engage.
        setTimeout(() => setVisible(true), 30_000);
      };
      window.addEventListener('beforeinstallprompt', handler);
      return () => window.removeEventListener('beforeinstallprompt', handler);
    } else {
      // iOS Safari: no event, just show after 30s.
      const timer = setTimeout(() => setVisible(true), 30_000);
      return () => clearTimeout(timer);
    }
  }, []);

  function handleAdd() {
    if (deferredPrompt.current) {
      deferredPrompt.current.prompt();
      deferredPrompt.current.userChoice.then(() => {
        deferredPrompt.current = null;
      });
    }
    dismiss();
    setVisible(false);
  }

  function handleDismiss() {
    dismiss();
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Instalare aplicație"
      style={{
        position: 'fixed',
        bottom: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        width: 'min(calc(100vw - 2rem), 22rem)',
        background: '#1a1a2e',
        color: '#f9fafb',
        borderRadius: '0.75rem',
        padding: '0.875rem 1rem',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.625rem',
        fontSize: '0.875rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
        {/* Simple home-screen icon hint */}
        <span style={{ fontSize: '1.25rem', lineHeight: 1, flexShrink: 0 }} aria-hidden>
          {isIos ? '⬆️' : '📲'}
        </span>
        <p style={{ margin: 0, lineHeight: 1.4 }}>
          {isIos ? (
            <>
              Apasă <strong>Share</strong> → <strong>Adaugă pe ecran principal</strong> pentru a
              comanda mai rapid.
            </>
          ) : (
            <>
              <strong>Adaugă pe ecran principal</strong> — comandă mai rapid.
            </>
          )}
        </p>
        <button
          onClick={handleDismiss}
          aria-label="Închide"
          style={{
            marginLeft: 'auto',
            flexShrink: 0,
            background: 'transparent',
            border: 'none',
            color: '#9ca3af',
            cursor: 'pointer',
            padding: '0.25rem',
            lineHeight: 1,
            fontSize: '1rem',
            // 44×44 tap target
            minWidth: '44px',
            minHeight: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ✕
        </button>
      </div>

      {/* Chrome/Android only — show "Adaugă" action button */}
      {!isIos && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button
            onClick={handleDismiss}
            style={{
              background: 'transparent',
              border: '1px solid #4b5563',
              color: '#9ca3af',
              borderRadius: '0.5rem',
              padding: '0.5rem 0.875rem',
              cursor: 'pointer',
              fontSize: '0.8125rem',
              minHeight: '44px',
            }}
          >
            Nu acum
          </button>
          <button
            onClick={handleAdd}
            style={{
              background: '#7c3aed',
              border: 'none',
              color: '#ffffff',
              borderRadius: '0.5rem',
              padding: '0.5rem 0.875rem',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.8125rem',
              minHeight: '44px',
            }}
          >
            Adaugă
          </button>
        </div>
      )}
    </div>
  );
}
