'use client';

import { createContext, useContext, useEffect, useState } from 'react';

// Resolved theme: 'dark' | 'light'. `system` is a *preference* that resolves
// to one of those two on every render based on the matchMedia query result.
export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'hir.courier.theme';

function readPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'dark';
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === 'light' || raw === 'system') return raw;
  return 'dark';
}

function systemResolved(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyClass(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');
  const [resolved, setResolved] = useState<ResolvedTheme>('dark');

  // Hydrate preference + resolved from localStorage on mount. Until this
  // effect runs the initial server-rendered HTML uses the value the
  // <ThemeScript> injected — see app/layout.tsx. The dual write here is
  // for the cases the script missed (very fast user navigation, JS
  // disabled scenarios that never actually re-render).
  useEffect(() => {
    const pref = readPreference();
    const next = pref === 'system' ? systemResolved() : pref;
    setPreferenceState(pref);
    setResolved(next);
    applyClass(next);

    if (pref !== 'system') return;
    // When preference is 'system', listen to the media query so the rider
    // crossing sunset doesn't have to flip the toggle manually.
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (e: MediaQueryListEvent) => {
      const r: ResolvedTheme = e.matches ? 'light' : 'dark';
      setResolved(r);
      applyClass(r);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  function setPreference(next: ThemePreference): void {
    setPreferenceState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
    const r: ResolvedTheme = next === 'system' ? systemResolved() : next;
    setResolved(r);
    applyClass(r);
  }

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

// Inline script that runs in <head> before first paint to apply the
// stored class. Without this the page renders with whatever default
// React put in the HTML, then flashes to the user's chosen theme on
// hydration — the classic FOUC. The script is stringified into a
// `<script>` tag rendered server-side; do not import it as a module.
export const themeScriptSource = `
(function () {
  try {
    var pref = localStorage.getItem('${STORAGE_KEY}');
    var resolved = 'dark';
    if (pref === 'light') resolved = 'light';
    else if (pref === 'system') resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    if (resolved === 'dark') document.documentElement.classList.add('dark');
  } catch (e) { document.documentElement.classList.add('dark'); }
})();
`.trim();
