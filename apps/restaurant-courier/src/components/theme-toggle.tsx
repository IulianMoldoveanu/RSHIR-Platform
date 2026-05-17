'use client';

import { Moon, Sun, Monitor, Check } from 'lucide-react';
import { useTheme, type ThemePreference } from './theme-provider';

type Option = { value: ThemePreference; label: string; icon: typeof Sun };
const OPTIONS: Option[] = [
  { value: 'dark', label: 'Întunecat', icon: Moon },
  { value: 'light', label: 'Luminos', icon: Sun },
  { value: 'system', label: 'Sistem', icon: Monitor },
];

// Segmented control rendered in /dashboard/settings. Default is dark
// so the rider's muscle memory doesn't shift on first install; light +
// system are opt-in. Persisted via localStorage by the provider.
//
// Visual: segmented pill with a violet "active" fill; active option
// also gets a tiny check chip top-right for unambiguous "this is the
// chosen one" — relevant because the violet fill alone can be missed
// in glare. Tap targets are ≥ 44px tall (px-3 py-2.5 + min-h-[44px]).
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
        Temă
      </p>
      <div
        role="radiogroup"
        aria-label="Temă vizuală"
        className="flex rounded-xl border border-hir-border bg-hir-bg p-1 ring-1 ring-inset ring-hir-border/40"
      >
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = preference === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setPreference(value)}
              className={`relative flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2 ${
                active
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30 ring-1 ring-inset ring-violet-400/30'
                  : 'text-hir-muted-fg hover:bg-hir-border/40 hover:text-hir-fg'
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
              {label}
              {active ? (
                <span
                  aria-hidden
                  className="absolute right-1 top-1 flex h-3 w-3 items-center justify-center rounded-full bg-white text-violet-600 shadow-sm shadow-violet-900/40"
                >
                  <Check className="h-2 w-2" strokeWidth={3} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-hir-muted-fg">
        &bdquo;Sistem&rdquo; urmărește preferința telefonului tău. Schimbarea este salvată local.
      </p>
    </div>
  );
}
