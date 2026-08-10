/**
 * The single gate on a tenant becoming publicly orderable.
 *
 * Every path into `tenants.status = 'ACTIVE'` goes through here: the platform
 * admin tenants list, the onboarding go-live button, and the wizard's final
 * step. Three copies of this rule would drift, and a drifted copy publishes a
 * vendor whose orders can never reach a courier — the failure the 2026-08-10
 * load test found, where an order is accepted, cooked, marked READY and then
 * offered to nobody.
 *
 * It reuses findCoverageGaps, so this gate and the warning banner on the
 * fleet-allocation grid always answer the same question the same way.
 */
import { loadGridData } from './queries';
import { findCoverageGaps } from './coverage';

export type CoverageBlock = 'no_fleet_assigned' | 'no_couriers_in_assigned_fleet';

export type CoverageCheck =
  | { ok: true }
  | { ok: false; reason: CoverageBlock | 'coverage_check_failed'; detail?: string };

export const COVERAGE_MESSAGES_RO: Record<CoverageBlock, string> = {
  no_fleet_assigned:
    'Nicio flotă alocată și nicio flotă de rezervă cu curieri. Alocă una din „Alocare flote".',
  no_couriers_in_assigned_fleet:
    'Flota alocată nu are niciun curier activ. Alocă altă flotă sau adaugă curieri în ea.',
};

export async function checkDeliveryCoverage(tenantId: string): Promise<CoverageCheck> {
  try {
    const grid = await loadGridData();
    // findCoverageGaps only inspects ACTIVE tenants, so a tenant that is
    // ONBOARDING or SUSPENDED never appears in its output. Ask about this one
    // as if it were already live — that is exactly "is it safe to publish?".
    const gap = findCoverageGaps({
      ...grid,
      restaurants: grid.restaurants.map((r) =>
        r.id === tenantId ? { ...r, status: 'ACTIVE' } : r,
      ),
    }).find((g) => g.tenantId === tenantId);

    if (!gap) return { ok: true };
    return {
      ok: false,
      reason:
        gap.reason === 'assigned_fleet_has_no_couriers'
          ? 'no_couriers_in_assigned_fleet'
          : 'no_fleet_assigned',
    };
  } catch (err) {
    // Fail closed. If we cannot prove somebody can deliver, we do not publish a
    // storefront that will take orders.
    return { ok: false, reason: 'coverage_check_failed', detail: (err as Error).message };
  }
}
