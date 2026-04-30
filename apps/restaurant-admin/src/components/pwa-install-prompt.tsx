'use client';
import { useEffect, useRef, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'hir_admin_pwa_dismissed';

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // localStorage blocked in private mode — silently ignore.
  }
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isSafari = /safari/i.test(ua) && !/chrome|chromium|crios|fxios|edgios/i.test(ua);
  return isIos && isSafari;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches;
}

function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

export function PwaInstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (!isMobile() || isStandalone() || isDismissed()) return;

    const ios = isIosSafari();
    setIsIos(ios);

    if (!ios) {
      const handler = (e: Event) => {
        e.preventDefault();
        deferredPrompt.current = e as BeforeInstallPromptEvent;
        setTimeout(() => setVisible(true), 30_000);
      };
      window.addEventListener('beforeinstallprompt', handler);
      return () => window.removeEventListener('beforeinstallprompt', handler);
    } else {
      const timer = setTimeout(() => setVisible(true), 30_000);
      return () => clearTimeout(timer);
    }
  }, []);

  function handleInstall() {
    if (deferredPrompt.current) {
      deferredPrompt.current.prompt();
      deferredPrompt.current.userChoice.then(() => {
        deferredPrompt.current = null;
      });
    }
    markDismissed();
    setVisible(false);
  }

  function handleDismiss() {
    markDismissed();
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Instalare HIR Admin"
      style={{
        position: 'fixed',
        bottom: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        width: 'min(calc(100vw - 2rem), 22rem)',
        background: '#18181b',
        color: '#f9fafb',
        borderRadius: '0.75rem',
        padding: '0.875rem 1rem',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        border: '1px solid #27272a',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.625rem',
        fontSize: '0.875rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '2rem',
            height: '2rem',
            borderRadius: '0.375rem',
            background: '#7c3aed',
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.875rem',
          }}
        >
          H
        </span>
        <p style={{ margin: 0, lineHeight: 1.4, paddingTop: '0.125rem' }}>
          {isIos ? (
            <>
              Apasă <strong>Share</strong> → <strong>Adaugă pe ecran principal</strong> pentru
              acces rapid la admin.
            </>
          ) : (
            <>
              <strong>Instalează HIR Admin pe telefon</strong> — acces rapid, fără browser.
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
            color: '#71717a',
            cursor: 'pointer',
            minWidth: '44px',
            minHeight: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1rem',
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {!isIos && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button
            onClick={handleDismiss}
            style={{
              background: 'transparent',
              border: '1px solid #3f3f46',
              color: '#a1a1aa',
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
            onClick={handleInstall}
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
            Instalează
          </button>
        </div>
      )}
    </div>
  );
}
