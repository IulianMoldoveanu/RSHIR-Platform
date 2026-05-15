'use client';

import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme, type ThemePreference } from './theme-provider';

type Option = { value: ThemePreference; label: string; icon: typeof Sun };
const OPTIONS: Option[] = [
  { value: 'dark', label: 'Întunecat', icon: Moon },
  { value: 'light', label: 'Luminos', icon: Sun },
  { value: 'system', label: 'Sistem', icon: Monitor },
];

// Segmented control rendered in /dashboard/settings. The default option is
// dark so the rider's muscle memory doesn't shift on first install; light
// + system are opt-in. Persisted via localStorage by the provider.
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        Temă
      </p>
      <div
        role="radiogroup"
        aria-label="Temă vizuală"
        className="flex rounded-xl border border-zinc-800 bg-zinc-900 p-1"
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
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                active
                  ? 'bg-violet-600 text-white'
                  : 'text-zinc-300 hover:bg-zinc-800/60'
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-zinc-500">
        „Sistem" urmărește preferința telefonului tău. Schimbarea este salvată local.
      </p>
    </div>
  );
}
