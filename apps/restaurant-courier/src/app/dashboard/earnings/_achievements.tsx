'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Award,
  CalendarCheck,
  Lock,
  Moon,
  Package,
  Star,
  Timer,
  Trophy,
} from 'lucide-react';
import {
  BADGE_DEFS,
  evaluateAndPersist,
  getStoredAchievements,
  type BadgeDef,
  type BadgeId,
} from '@/lib/achievements';
import { celebrate as hapticCelebrate } from '@/lib/haptics';

/** Server-derived metrics passed as props so no client-side DB call is needed. */
type Props = {
  totalDeliveries: number;
  nightDeliveries: number;
  longestShiftHours: number;
  maxConsecutiveDays: number;
};

// Lucide icon map — only the icons used by BADGE_DEFS.
const ICON_MAP: Record<string, typeof Package> = {
  Package,
  Star,
  Award,
  Trophy,
  Moon,
  Timer,
  CalendarCheck,
};

const TONE_UNLOCKED: Record<BadgeDef['tone'], string> = {
  violet: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
  amber: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  sky: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  rose: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
};

const TONE_ICON_UNLOCKED: Record<BadgeDef['tone'], string> = {
  violet: 'text-violet-400',
  amber: 'text-amber-400',
  emerald: 'text-emerald-400',
  sky: 'text-sky-400',
  rose: 'text-rose-400',
};

/** Format unlock date as "dd mmm" in Romanian. */
function formatUnlockDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

export function Achievements({
  totalDeliveries,
  nightDeliveries,
  longestShiftHours,
  maxConsecutiveDays,
}: Props) {
  const [unlockedMap, setUnlockedMap] = useState<Partial<Record<BadgeId, string>>>({});
  const [newToastId, setNewToastId] = useState<BadgeId | null>(null);
  const evaluated = useRef(false);

  useEffect(() => {
    if (evaluated.current) return;
    evaluated.current = true;

    // Evaluate and persist — returns IDs newly unlocked this session.
    const newlyUnlocked = evaluateAndPersist({
      totalDeliveries,
      nightDeliveries,
      longestShiftHours,
      maxConsecutiveDays,
    });

    // Read stored state (now includes newly unlocked ones).
    const stored = getStoredAchievements();
    const map: Partial<Record<BadgeId, string>> = {};
    for (const [id, state] of Object.entries(stored)) {
      if (state?.unlockedAt) {
        map[id as BadgeId] = state.unlockedAt;
      }
    }
    setUnlockedMap(map);

    // Show toast for the first newly unlocked badge.
    if (newlyUnlocked.length > 0) {
      setNewToastId(newlyUnlocked[0]);
      hapticCelebrate();
    }
  }, [totalDeliveries, nightDeliveries, longestShiftHours, maxConsecutiveDays]);

  const unlockedCount = Object.keys(unlockedMap).length;
  const total = BADGE_DEFS.length;

  return (
    <>
      <section aria-labelledby="achievements-heading">
        <div className="mb-2 flex items-center justify-between">
          <h2
            id="achievements-heading"
            className="text-xs font-semibold uppercase tracking-wide text-zinc-500"
          >
            Realizări ({unlockedCount}/{total})
          </h2>
        </div>
        <ul className="grid grid-cols-4 gap-2" role="list">
          {BADGE_DEFS.map((badge) => {
            const unlockedAt = unlockedMap[badge.id];
            const isUnlocked = !!unlockedAt;
            const IconComp = ICON_MAP[badge.icon] ?? Package;

            return (
              <li key={badge.id}>
                <button
                  type="button"
                  disabled={!isUnlocked}
                  aria-label={
                    isUnlocked
                      ? `${badge.label} — deblocat ${formatUnlockDate(unlockedAt!)}`
                      : `${badge.label} — blocat. ${badge.description}`
                  }
                  title={
                    isUnlocked
                      ? `${badge.label}: ${badge.description} (${formatUnlockDate(unlockedAt!)})`
                      : `Blocat: ${badge.description}`
                  }
                  className={`flex w-full flex-col items-center gap-1.5 rounded-2xl border p-3 text-center transition-colors focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2 ${
                    isUnlocked
                      ? TONE_UNLOCKED[badge.tone]
                      : 'border-hir-border bg-hir-surface text-zinc-600'
                  }`}
                >
                  <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-hir-bg/30">
                    {isUnlocked ? (
                      <IconComp
                        className={`h-4 w-4 ${TONE_ICON_UNLOCKED[badge.tone]}`}
                        aria-hidden
                      />
                    ) : (
                      <Lock className="h-3.5 w-3.5 text-zinc-600" aria-hidden />
                    )}
                  </span>
                  <span className="text-[9px] font-semibold leading-tight">{badge.label}</span>
                  {isUnlocked && unlockedAt ? (
                    <span className="text-[8px] leading-none opacity-70">
                      {formatUnlockDate(unlockedAt)}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Badge unlock toast — shown once per session on first unlock. */}
      {newToastId ? (
        <BadgeToast
          badge={BADGE_DEFS.find((b) => b.id === newToastId)!}
          onDismiss={() => setNewToastId(null)}
        />
      ) : null}
    </>
  );
}

function BadgeToast({ badge, onDismiss }: { badge: BadgeDef; onDismiss: () => void }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, 4500);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  if (!visible) return null;

  const IconComp = ICON_MAP[badge.icon] ?? Package;

  return (
    <button
      type="button"
      aria-live="polite"
      aria-label={`Realizare deblocată: ${badge.label}`}
      onClick={() => {
        setVisible(false);
        onDismiss();
      }}
      className="fixed bottom-24 left-1/2 z-[1400] flex max-w-xs -translate-x-1/2 items-center gap-3 rounded-2xl border border-violet-500/40 bg-zinc-950/95 px-4 py-3 text-left shadow-lg backdrop-blur active:scale-[0.98]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/20">
        <IconComp className="h-5 w-5 text-violet-400" aria-hidden />
      </span>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-400">
          Realizare deblocată
        </p>
        <p className="mt-0.5 text-sm font-semibold text-zinc-100">{badge.label}</p>
        <p className="mt-0.5 text-xs text-zinc-400">{badge.description}</p>
      </div>
    </button>
  );
}
