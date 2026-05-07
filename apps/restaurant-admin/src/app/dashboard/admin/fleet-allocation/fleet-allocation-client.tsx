'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  assignFleet,
  promoteToPrimary,
  runRecommendations,
  terminateAssignment,
  type RunRecommendationsResult,
} from './actions';
import type {
  AssignmentRow,
  FleetRow,
  RestaurantRow,
} from '@/lib/fleet-allocation/queries';
import { cellStatus, type CellStatus } from '@/lib/fleet-allocation/grid-helpers';

const CELL_STYLES: Record<CellStatus['kind'], string> = {
  empty: 'bg-white text-zinc-400',
  primary_active: 'bg-emerald-100 text-emerald-900 ring-1 ring-inset ring-emerald-300',
  secondary_active: 'bg-sky-50 text-sky-900 ring-1 ring-inset ring-sky-200',
  paused: 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200',
  terminated: 'bg-zinc-50 text-zinc-500',
};

const CELL_LABEL: Record<CellStatus['kind'], string> = {
  empty: '—',
  primary_active: 'Primary',
  secondary_active: 'Secondary',
  paused: 'Pauzat',
  terminated: 'Terminat',
};

export function FleetAllocationClient({
  fleets,
  restaurants,
  assignments,
}: {
  fleets: FleetRow[];
  restaurants: RestaurantRow[];
  assignments: AssignmentRow[];
}) {
  const [openCell, setOpenCell] = useState<{ fleetId: string; restaurantId: string } | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const [recResult, setRecResult] = useState<RunRecommendationsResult | null>(null);
  const [recPending, startRecTransition] = useTransition();

  // Stable map for O(1) cell lookup during render.
  const assignmentByPair = useMemo(() => {
    const m = new Map<string, AssignmentRow[]>();
    for (const a of assignments) {
      const k = `${a.fleet_id}::${a.restaurant_tenant_id}`;
      const arr = m.get(k);
      if (arr) arr.push(a);
      else m.set(k, [a]);
    }
    return m;
  }, [assignments]);

  function showFeedback(kind: 'ok' | 'err', text: string) {
    setFeedback({ kind, text });
    setTimeout(() => setFeedback(null), 4000);
  }

  function withAction<T>(
    promise: Promise<{ ok: true } | { ok: false; error: string } | T>,
    successMsg: string,
  ) {
    startTransition(async () => {
      const r = (await promise) as { ok: boolean; error?: string };
      if (r.ok) {
        showFeedback('ok', successMsg + ' (reîmprospătați pagina pentru date la zi)');
        setOpenCell(null);
      } else {
        showFeedback('err', r.error ?? 'Eroare necunoscută.');
      }
    });
  }

  function onAssign(
    fleetId: string,
    restaurantId: string,
    role: 'primary' | 'secondary',
  ) {
    withAction(
      assignFleet({ fleet_id: fleetId, restaurant_tenant_id: restaurantId, role }),
      role === 'primary' ? 'Flotă primară setată.' : 'Flotă secundară setată.',
    );
  }

  function onPromote(assignmentId: string) {
    withAction(promoteToPrimary({ assignment_id: assignmentId }), 'Promovat la primary.');
  }

  function onTerminate(assignmentId: string) {
    if (!window.confirm('Confirmați terminarea acestei asocieri?')) return;
    withAction(terminateAssignment({ assignment_id: assignmentId }), 'Asociere terminată.');
  }

  function onRunRecommendations() {
    startRecTransition(async () => {
      const r = await runRecommendations();
      setRecResult(r);
    });
  }

  return (
    <div className="space-y-6">
      {/* Recommendations panel — top to make algo discoverable. */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Recomandări algoritm</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Rulare pentru ora de vârf vineri 19:00. Pur informativ — nicio
              alocare nu se aplică automat.
            </p>
          </div>
          <button
            type="button"
            onClick={onRunRecommendations}
            disabled={recPending}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {recPending ? 'Se rulează…' : 'Rulează algoritm'}
          </button>
        </div>

        {recResult && recResult.ok && (
          <div className="mt-4">
            {recResult.output.needs_new_fleet && (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Capacitate insuficientă pe {recResult.output.uncovered_city_ids.length || '—'}{' '}
                oraș(e). Recomandare: extindere flotă existentă sau onboarding flotă nouă.
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-zinc-50 text-zinc-600">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Restaurant</th>
                    <th className="px-3 py-2 text-left font-medium">Flotă recomandată</th>
                    <th className="px-3 py-2 text-left font-medium">Rol</th>
                    <th className="px-3 py-2 text-right font-medium">Utilizare proiectată</th>
                    <th className="px-3 py-2 text-left font-medium">Motiv</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {recResult.output.recommendations.map((r) => (
                    <tr key={r.restaurant_tenant_id}>
                      <td className="px-3 py-2 text-zinc-900">{r.restaurant_name}</td>
                      <td className="px-3 py-2 text-zinc-700">{r.fleet_name ?? '—'}</td>
                      <td className="px-3 py-2 text-zinc-700">{r.role ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-zinc-700 tabular-nums">
                        {r.projected_utilization === null
                          ? '—'
                          : r.projected_utilization.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-zinc-600">{prettyReason(r.reason)}</td>
                    </tr>
                  ))}
                  {recResult.output.recommendations.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-zinc-500">
                        Niciun restaurant cu cerere estimată &gt; 0. Adăugați
                        estimări de cerere pentru a primi recomandări (PR1d).
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {recResult && !recResult.ok && (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            Eroare la rulare: {recResult.error}
          </div>
        )}
      </section>

      {/* Feedback toast (lightweight). */}
      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={
            feedback.kind === 'ok'
              ? 'rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900'
              : 'rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900'
          }
        >
          {feedback.text}
        </div>
      )}

      {/* Grid */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-900">Matrice alocare</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Coloane = flote (curieri activi · ținta/h). Rânduri = restaurante.
          Apăsați pe o celulă pentru opțiuni.
        </p>

        {fleets.length === 0 || restaurants.length === 0 ? (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {fleets.length === 0
              ? 'Nicio flotă activă — adăugați mai întâi o flotă din /dashboard/admin/fleet-managers.'
              : 'Niciun restaurant — onboarding-ul este pasul anterior.'}
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-1 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-zinc-600">
                    Restaurant
                  </th>
                  {fleets.map((f) => (
                    <th
                      key={f.id}
                      className="px-2 py-2 text-left text-zinc-700"
                      title={`${f.name} (${f.delivery_app})`}
                    >
                      <div className="font-medium text-zinc-900">{f.name}</div>
                      <div className="font-normal text-zinc-500">
                        {f.active_courier_count} curieri · {f.target_orders_per_hour}/h
                        {f.delivery_app === 'external' && (
                          <span className="ml-1 rounded-sm bg-violet-100 px-1 text-[10px] text-violet-800">
                            ext
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {restaurants.map((r) => (
                  <tr key={r.id}>
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 align-top text-zinc-900">
                      <div className="font-medium">{r.name}</div>
                      <div className="font-normal text-zinc-500">{r.city_name ?? '—'}</div>
                    </td>
                    {fleets.map((f) => {
                      const status = cellStatus(assignmentByPair.get(`${f.id}::${r.id}`) ?? []);
                      const isOpen =
                        openCell?.fleetId === f.id && openCell?.restaurantId === r.id;
                      return (
                        <td key={f.id} className="relative align-top">
                          <button
                            type="button"
                            onClick={() => setOpenCell(isOpen ? null : { fleetId: f.id, restaurantId: r.id })}
                            className={`block w-full rounded-md px-2 py-1.5 text-left text-[11px] font-medium transition-colors hover:opacity-80 ${CELL_STYLES[status.kind]}`}
                            aria-haspopup="menu"
                            aria-expanded={isOpen}
                          >
                            {CELL_LABEL[status.kind]}
                          </button>

                          {isOpen && (
                            <div
                              role="menu"
                              className="absolute left-0 top-full z-20 mt-1 w-56 rounded-md border border-zinc-200 bg-white p-1 shadow-lg"
                            >
                              <CellMenu
                                status={status}
                                disabled={isPending}
                                onAssignPrimary={() => onAssign(f.id, r.id, 'primary')}
                                onAssignSecondary={() => onAssign(f.id, r.id, 'secondary')}
                                onPromote={
                                  status.kind === 'secondary_active'
                                    ? () => onPromote(status.assignment.id)
                                    : undefined
                                }
                                onTerminate={
                                  status.kind === 'primary_active' ||
                                  status.kind === 'secondary_active' ||
                                  status.kind === 'paused'
                                    ? () => onTerminate(status.assignment.id)
                                    : undefined
                                }
                                onClose={() => setOpenCell(null)}
                              />
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function CellMenu({
  status,
  disabled,
  onAssignPrimary,
  onAssignSecondary,
  onPromote,
  onTerminate,
  onClose,
}: {
  status: CellStatus;
  disabled: boolean;
  onAssignPrimary: () => void;
  onAssignSecondary: () => void;
  onPromote?: () => void;
  onTerminate?: () => void;
  onClose: () => void;
}) {
  const isActive = status.kind === 'primary_active' || status.kind === 'secondary_active';
  return (
    <div className="flex flex-col gap-0.5">
      {!isActive && (
        <>
          <MenuItem disabled={disabled} onClick={onAssignPrimary}>
            Alocați ca primary
          </MenuItem>
          <MenuItem disabled={disabled} onClick={onAssignSecondary}>
            Alocați ca secondary
          </MenuItem>
        </>
      )}
      {onPromote && (
        <MenuItem disabled={disabled} onClick={onPromote}>
          Promovați secondary → primary
        </MenuItem>
      )}
      {onTerminate && (
        <MenuItem disabled={disabled} onClick={onTerminate} tone="danger">
          Terminați asocierea
        </MenuItem>
      )}
      <MenuItem disabled={false} onClick={onClose} tone="muted">
        Anulează
      </MenuItem>
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  tone?: 'danger' | 'muted';
}) {
  const cls =
    tone === 'danger'
      ? 'text-rose-700 hover:bg-rose-50'
      : tone === 'muted'
        ? 'text-zinc-600 hover:bg-zinc-50'
        : 'text-zinc-800 hover:bg-zinc-50';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role="menuitem"
      className={`rounded-sm px-2 py-1.5 text-left text-xs disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}

function prettyReason(
  reason:
    | 'assigned_within_band'
    | 'assigned_above_band_acceptable'
    | 'no_capacity'
    | 'no_fleet_in_city'
    | 'restaurant_no_demand'
    | 'invalid_input',
): string {
  switch (reason) {
    case 'assigned_within_band':
      return 'În banda 3–5';
    case 'assigned_above_band_acceptable':
      return 'Peste banda țintă';
    case 'no_capacity':
      return 'Capacitate epuizată';
    case 'no_fleet_in_city':
      return 'Fără flotă în oraș';
    case 'restaurant_no_demand':
      return 'Cerere estimată = 0';
    case 'invalid_input':
      return 'Date invalide';
  }
}
