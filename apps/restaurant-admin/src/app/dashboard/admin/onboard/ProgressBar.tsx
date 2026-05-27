// Progress indicator for the 3-step onboarding wizard.
// Shows numbered dots + "Pasul X din 3" label. No dependencies beyond React/Tailwind.

const LABELS = ['Restaurant', 'Cont', 'Brand'] as const;

export function ProgressBar({ current }: { current: 0 | 1 | 2 }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-xs font-medium text-zinc-500">
        Pasul {current + 1} din 3 —{' '}
        <span className="font-semibold text-zinc-700">{LABELS[current]}</span>
      </p>
      <div className="flex items-center gap-0">
        {LABELS.map((label, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <div key={label} className="flex items-center">
              <div
                aria-current={active ? 'step' : undefined}
                aria-label={`Pasul ${i + 1}: ${label}${done ? ' (finalizat)' : active ? ' (curent)' : ''}`}
                className={[
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors',
                  done
                    ? 'bg-indigo-600 text-white'
                    : active
                    ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                    : 'bg-zinc-200 text-zinc-400',
                ].join(' ')}
              >
                {done ? (
                  <svg
                    viewBox="0 0 12 12"
                    className="h-4 w-4"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="2,6 5,9 10,3" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              {i < LABELS.length - 1 && (
                <div
                  className={[
                    'h-0.5 w-12 sm:w-16 transition-colors',
                    i < current ? 'bg-indigo-600' : 'bg-zinc-200',
                  ].join(' ')}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
