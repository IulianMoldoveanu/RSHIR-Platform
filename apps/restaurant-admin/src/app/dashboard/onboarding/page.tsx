import Link from 'next/link';
import { computeOnboardingState, type OnboardingState } from '@/lib/onboarding';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { goLiveAction } from './actions';

export const dynamic = 'force-dynamic';

type StepKey = 'menu_added' | 'hours_set' | 'zones_set' | 'went_live';

type Step = {
  key: StepKey;
  title: string;
  description: string;
  // QW1 (UIUX audit 2026-05-08): per-step time anchor. Value is locale-neutral
  // (digit + abbreviated unit) so it works in both RO and EN without
  // translation. GloriaFood publishes the same "~15 min total" anchor on
  // their onboarding — we ship a per-step breakdown that adds up to ~10 min.
  eta: string;
  links: { href: string; label: string }[];
};

const STEPS: Step[] = [
  {
    key: 'menu_added',
    title: 'Adaugă produsele',
    description: 'Construiește meniul manual sau importă-l rapid dintr-o poză.',
    eta: '~3 min',
    links: [
      { href: '/dashboard/menu', label: 'Deschide meniul' },
      { href: '/dashboard/menu/import', label: 'Import din poză' },
    ],
  },
  {
    key: 'hours_set',
    title: 'Setează programul',
    description: 'Definește orele de funcționare pentru fiecare zi a săptămânii.',
    eta: '~2 min',
    links: [{ href: '/dashboard/settings/operations', label: 'Configurează programul' }],
  },
  {
    key: 'zones_set',
    title: 'Definește zona de livrare',
    description: 'Trasează zonele pe hartă și configurează pragurile de preț.',
    eta: '~5 min',
    links: [{ href: '/dashboard/zones', label: 'Configurează zonele' }],
  },
  {
    key: 'went_live',
    title: 'Activează comenzile',
    description:
      'Pornește primirea de comenzi. Vei putea oricând să pui restaurantul pe pauză din Operațiuni.',
    eta: '~30 sec',
    links: [{ href: '/dashboard/settings/domain', label: 'Atașează domeniu (opțional)' }],
  },
];

function StepIcon({ done, current }: { done: boolean; current: boolean }) {
  if (done) {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M16.7 5.3a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.8 6.3-6.3a1 1 0 011.4 0z"
          />
        </svg>
      </span>
    );
  }
  return (
    <span
      className={
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ' +
        (current ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-zinc-300 text-zinc-400')
      }
    >
      <span className={'h-2 w-2 rounded-full ' + (current ? 'bg-amber-400' : 'bg-zinc-300')} />
    </span>
  );
}

function StepRow({
  index,
  step,
  state,
  current,
  canGoLive,
  tenantId,
}: {
  index: number;
  step: Step;
  state: OnboardingState;
  current: boolean;
  canGoLive: boolean;
  tenantId: string;
}) {
  const done = state[step.key];
  const isGoLiveStep = step.key === 'went_live';
  const goLiveReady = state.menu_added && state.hours_set && state.zones_set;

  return (
    <li
      className={
        'flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:gap-4 ' +
        (current ? 'border-amber-300 ring-1 ring-amber-200' : 'border-zinc-200')
      }
    >
      <div className="flex items-start gap-3">
        <StepIcon done={done} current={current} />
        <div className="text-xs font-medium text-zinc-400">Pasul {index + 1}</div>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="text-sm font-semibold text-zinc-900">{step.title}</h3>
            <span className="text-xs font-normal text-zinc-500" aria-label="Timp estimat">
              {step.eta}
            </span>
          </div>
          <p className="text-sm text-zinc-600">{step.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {step.links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex items-center rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {l.label}
            </Link>
          ))}
          {isGoLiveStep && (
            <form action={goLiveAction}>
              <input type="hidden" name="tenantId" value={tenantId} />
              <button
                type="submit"
                disabled={!canGoLive || !goLiveReady || done}
                className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {done ? 'Activat' : 'Activează comenzile'}
              </button>
            </form>
          )}
        </div>
        {isGoLiveStep && !goLiveReady && !done && (
          <p className="text-xs text-zinc-500">
            Completează pașii 1-3 înainte de a activa comenzile.
          </p>
        )}
        {isGoLiveStep && !canGoLive && (
          <p className="text-xs text-rose-600">
            Doar utilizatorii cu rolul OWNER pot activa comenzile.
          </p>
        )}
      </div>
    </li>
  );
}

export default async function OnboardingPage() {
  const { user, tenant } = await getActiveTenant();
  const [state, role] = await Promise.all([
    computeOnboardingState(tenant.id),
    getTenantRole(user.id, tenant.id),
  ]);

  const flagsInOrder = STEPS.map((s) => state[s.key]);
  const currentIndex = flagsInOrder.findIndex((v) => !v);
  const allDone = currentIndex === -1;
  const completedCount = flagsInOrder.filter(Boolean).length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Configurare {tenant.name}
        </h1>
        <p className="text-sm text-zinc-600">
          Patru pași până ești gata să primești comenzi. Poți reveni oricând la acest ecran din
          meniul lateral.
        </p>
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${(completedCount / STEPS.length) * 100}%` }}
            />
          </div>
          <span className="text-xs font-medium text-zinc-500">
            {completedCount}/{STEPS.length}
          </span>
        </div>
      </header>

      {allDone && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Configurarea e completă. Restaurantul primește comenzi.{' '}
          <Link href="/dashboard" className="font-semibold underline">
            Mergi la dashboard
          </Link>
          .
        </div>
      )}

      {!allDone && (
        <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div>
              <p className="text-sm font-semibold text-indigo-900">
                Folosește asistentul de configurare
              </p>
              <p className="mt-0.5 text-xs text-indigo-700">
                Te ghidăm pas cu pas (detalii → brand → meniu → livrare → plăți → activare).
                Salvăm automat după fiecare modificare. ~10 min total.
              </p>
            </div>
            <Link
              href="/dashboard/onboarding/wizard"
              className="inline-flex shrink-0 items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              Deschide asistentul →
            </Link>
          </div>
        </div>
      )}

      {!state.menu_added && (
        <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-white p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div>
              <p className="text-sm font-semibold text-purple-900">
                Vii de la GloriaFood?
              </p>
              <p className="mt-0.5 text-xs text-purple-700">
                Importă meniul în 5 minute dintr-un export CSV. Categoriile, prețurile și
                descrierile sunt mapate automat.
              </p>
            </div>
            <Link
              href="/dashboard/onboarding/migrate-from-gloriafood"
              className="inline-flex shrink-0 items-center justify-center rounded-md bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-purple-700"
            >
              Migrează din GloriaFood →
            </Link>
          </div>
        </div>
      )}

      <ol className="flex flex-col gap-3">
        {STEPS.map((step, i) => (
          <StepRow
            key={step.key}
            index={i}
            step={step}
            state={state}
            current={!allDone && i === currentIndex}
            canGoLive={role === 'OWNER'}
            tenantId={tenant.id}
          />
        ))}
      </ol>

      <div className="text-xs text-zinc-500">
        Vrei să sari peste? Mergi la{' '}
        <Link href="/dashboard?skipOnboarding=1" className="underline">
          dashboard
        </Link>{' '}
        și continuă mai târziu.
      </div>
    </div>
  );
}
