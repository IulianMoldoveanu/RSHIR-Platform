'use client';

import { useCallback, useEffect, useId, useReducer, useState } from 'react';
import { Bell, BellOff, MessageSquare, AlertTriangle, Megaphone } from 'lucide-react';
import {
  loadPreferences,
  savePreferences,
  type NotificationCategory,
  type NotificationPreferences,
} from '@/lib/push/preferences';

type CategoryMeta = {
  key: NotificationCategory;
  label: string;
  description: string;
  icon: React.ElementType;
};

const CATEGORIES: CategoryMeta[] = [
  {
    key: 'new_orders',
    label: 'Comenzi noi',
    description: 'Alertă când apare o ofertă de comandă pentru flota ta.',
    icon: Bell,
  },
  {
    key: 'dispatcher_messages',
    label: 'Mesaje dispecer',
    description: 'Notificări când dispecerul îți trimite un mesaj direct.',
    icon: MessageSquare,
  },
  {
    key: 'urgencies',
    label: 'Urgențe și anulări',
    description: 'Alerte critice: comandă anulată, FORCE_CANCELLED sau situații de urgență.',
    icon: AlertTriangle,
  },
  {
    key: 'marketing',
    label: 'Anunțuri HIR',
    description: 'Noutăți despre platformă, funcții noi sau oferte speciale. (implicit oprit)',
    icon: Megaphone,
  },
];

type Action =
  | { type: 'init'; prefs: NotificationPreferences }
  | { type: 'toggle'; key: NotificationCategory };

type State = { prefs: NotificationPreferences; saved: boolean };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'init':
      return { prefs: action.prefs, saved: false };
    case 'toggle': {
      const updated = { ...state.prefs, [action.key]: !state.prefs[action.key] };
      savePreferences(updated);
      return { prefs: updated, saved: true };
    }
  }
}

function ToggleSwitch({
  id,
  checked,
  onChange,
  label,
}: {
  id: string;
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
      style={{ background: checked ? 'rgb(139, 92, 246)' : 'rgb(63, 63, 70)' }}
    >
      <span className="sr-only">{checked ? 'Activat' : 'Dezactivat'}</span>
      <span
        aria-hidden
        className="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
        style={{ transform: checked ? 'translateX(20px)' : 'translateX(2px)' }}
      />
    </button>
  );
}

export function NotificationPreferences() {
  const baseId = useId();
  const [state, dispatch] = useReducer(reducer, {
    prefs: {
      new_orders: true,
      dispatcher_messages: true,
      urgencies: true,
      marketing: false,
    },
    saved: false,
  });

  useEffect(() => {
    dispatch({ type: 'init', prefs: loadPreferences() });
  }, []);

  const handleToggle = useCallback((key: NotificationCategory) => {
    dispatch({ type: 'toggle', key });
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(30);
    }
  }, []);

  return (
    <section
      aria-label="Preferințe notificări"
      className="rounded-2xl border border-hir-border bg-hir-surface p-5"
    >
      <div className="mb-1 flex items-center gap-2">
        <Bell className="h-4 w-4 text-violet-400" aria-hidden />
        <h2 className="text-base font-semibold text-hir-fg">Notificări push</h2>
      </div>
      <p className="mb-4 text-[11px] text-hir-muted-fg">
        Alege ce tipuri de notificări primești. Modificările se aplică imediat pe acest dispozitiv.
      </p>

      <PermissionDeniedBanner />

      <ul className="divide-y divide-hir-border/60" role="list">
        {CATEGORIES.map(({ key, label, description, icon: Icon }) => {
          const switchId = `${baseId}-${key}`;
          return (
            <li key={key} className="flex items-center gap-4 py-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-hir-border/60">
                <Icon className="h-4 w-4 text-hir-muted-fg" aria-hidden />
              </span>
              <label htmlFor={switchId} className="min-w-0 flex-1 cursor-pointer">
                <p className="text-sm font-medium leading-snug text-hir-fg">{label}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-hir-muted-fg">{description}</p>
              </label>
              <ToggleSwitch
                id={switchId}
                checked={state.prefs[key]}
                onChange={() => handleToggle(key)}
                label={label}
              />
            </li>
          );
        })}
      </ul>

      {state.saved && (
        <p role="status" aria-live="polite" className="mt-3 text-center text-[11px] text-emerald-400">
          Preferințele au fost salvate.
        </p>
      )}

      <p className="mt-4 text-[10px] leading-relaxed text-hir-muted-fg">
        Preferințele sunt stocate local pe dispozitiv. Pentru a dezactiva complet notificările,
        folosește setările sistemului de operare.
      </p>
    </section>
  );
}

function PermissionDeniedBanner() {
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!('Notification' in window)) return;
    setDenied(Notification.permission === 'denied');
  }, []);

  if (!denied) return null;

  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-3 rounded-xl border border-amber-700/40 bg-amber-500/10 px-3 py-3"
    >
      <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
      <p className="text-[11px] leading-relaxed text-amber-300">
        Notificările push sunt blocate de sistemul de operare. Deschide{' '}
        <strong>Setări &rarr; Notificări</strong> și permite accesul pentru HIR Curier, apoi
        întoarce-te aici.
      </p>
    </div>
  );
}
