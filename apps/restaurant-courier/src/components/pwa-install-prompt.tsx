'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

// Offers the courier a one-tap install instead of making them find
// "Add to Home screen" in the browser menu. The storefront has the same
// pattern; this copy is worded for someone starting a shift rather than
// someone ordering food, and uses the courier app's own colours.
//
// Chrome/Android fires `beforeinstallprompt` before showing its own UI.
// iOS Safari never fires it, so there we can only tell them where to tap.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'hir_curier_pwa_dismissed_until';
const DISMISS_DAYS = 14;

// Signing in is when someone decides where this app is going to live, so ask
// then — after a beat, so it reads as part of the page settling rather than a
// popup fired at them. Anywhere else the courier is mid-job, and the offer can
// wait a good while before it interrupts anything.
const SHOW_AFTER_SIGN_IN_MS = 2_500;
const SHOW_AFTER_MS = 20_000;

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
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 86_400_000));
  } catch {
    // localStorage blocked (private mode) — the prompt just reappears later.
  }
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isSafari = /safari/i.test(ua) && !/chrome|chromium|crios|fxios|edgios/i.test(ua);
  return isIos && isSafari;
}

// True when the app is already installed, so we never nag inside it.
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS reports installed PWAs here instead of via display-mode.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function PwaInstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const pathname = usePathname();
  const onSignIn = pathname === '/login' || pathname === '/register';

  useEffect(() => {
    if (isStandalone() || isDismissed()) return;

    const delay = onSignIn ? SHOW_AFTER_SIGN_IN_MS : SHOW_AFTER_MS;
    const ios = isIosSafari();
    setIsIos(ios);

    if (ios) {
      const timer = setTimeout(() => setVisible(true), delay);
      return () => clearTimeout(timer);
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      timer = setTimeout(() => setVisible(true), delay);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Chrome fires this once the install completes, from our prompt or its own.
    const installed = () => {
      dismiss();
      setVisible(false);
    };
    window.addEventListener('appinstalled', installed);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
      if (timer) clearTimeout(timer);
    };
  }, [onSignIn]);

  async function handleAdd() {
    const prompt = deferredPrompt.current;
    setVisible(false);
    dismiss();
    if (!prompt) return;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      // The browser refused to show it (already handled, or not a user
      // gesture any more). Nothing to recover — the browser menu still works.
    }
    deferredPrompt.current = null;
  }

  function handleDismiss() {
    dismiss();
    setVisible(false);
  }

  if (!visible) return null;

  const btn = {
    borderRadius: '0.5rem',
    padding: '0.5rem 0.875rem',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    minHeight: '44px',
  } as const;

  return (
    <div
      role="dialog"
      aria-label="Instalare aplicație"
      style={{
        position: 'fixed',
        bottom: 'calc(1rem + env(safe-area-inset-bottom))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        width: 'min(calc(100vw - 2rem), 22rem)',
        background: '#13131f',
        color: '#f9fafb',
        border: '1px solid #2a2a3f',
        borderRadius: '0.75rem',
        padding: '0.875rem 1rem',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.625rem',
        fontSize: '0.875rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
        <span style={{ fontSize: '1.25rem', lineHeight: 1, flexShrink: 0 }} aria-hidden>
          {isIos ? '⬆️' : '📲'}
        </span>
        <p style={{ margin: 0, lineHeight: 1.4 }}>
          {isIos ? (
            <>
              Apasă <strong>Share</strong> → <strong>Adaugă pe ecranul principal</strong> ca să ai
              comenzile la un tap.
            </>
          ) : (
            <>
              <strong>Instalează HIR Curier</strong> — comenzile la un tap, fără browser.
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
            lineHeight: 1,
            fontSize: '1rem',
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

      {!isIos && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button
            onClick={handleDismiss}
            style={{
              ...btn,
              background: 'transparent',
              border: '1px solid #4b5563',
              color: '#9ca3af',
            }}
          >
            Nu acum
          </button>
          <button
            onClick={handleAdd}
            style={{
              ...btn,
              background: '#8b5cf6',
              border: 'none',
              color: '#ffffff',
              fontWeight: 600,
            }}
          >
            Instalează
          </button>
        </div>
      )}
    </div>
  );
}
