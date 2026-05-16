/**
 * Rider mode resolution — determines which UI variant the courier sees.
 *
 * THREE MODES (locked in decision_courier_three_modes.md)
 * -------------------------------------------------------
 * Mode A — Solo courier. Single restaurant tenant, no managed fleet.
 *   Rules: courier_profiles.fleet_id is null OR points to the platform-default
 *   fleet ('hir-default'), AND the user has at most one tenant_members row.
 *   UI: full swipe-to-confirm panel (accept / pickup / deliver).
 *
 * Mode B — Multi-vendor courier. Works for more than one restaurant tenant
 *   but is not assigned to a managed fleet.
 *   Rules: same fleet condition as A, but tenant_members count > 1.
 *   UI: full swipe-to-confirm panel; order list shows a tenant badge to
 *   distinguish which restaurant each order belongs to.
 *
 * Mode C — Fleet-managed courier. Assigned to a named fleet run by a third
 *   party (Bringo, Bolt-Fleet, internal partner fleet). Status visibility
 *   is provided by HIR Curier, but the actual pickup/deliver transitions
 *   happen in the fleet's own app.
 *   Rules: courier_profiles.fleet_id points to a non-default fleet row.
 *   UI: READ-ONLY order detail (no swipe buttons). A static info card
 *   directs the courier to their fleet app.
 *
 * RESOLUTION RULES (never set manually; derived from DB at request time)
 * ----------------------------------------------------------------------
 *   1. If fleet_id → non-default fleet → Mode C.
 *   2. Else if tenant_members count > 1 → Mode B.
 *   3. Else → Mode A.
 *
 * Safe defaults: a brand-new courier with no profile returns Mode A so the
 * dashboard renders the simplest variant without a redirect or error.
 *
 * @param userId - Supabase auth user id (UUID).
 */

import { createAdminClient } from './supabase/admin';

export type RiderMode = 'A' | 'B' | 'C';

export type RiderModeContext = {
  mode: RiderMode;
  fleetId: string | null;
  fleetName: string | null;
  fleetContactPhone: string | null;
  tenantCount: number;
};

const DEFAULT_CONTEXT: RiderModeContext = {
  mode: 'A',
  fleetId: null,
  fleetName: null,
  fleetContactPhone: null,
  tenantCount: 1,
};

// The platform-default fleet (created in 20260428_002) is backfilled
// onto every courier_profile so courier_orders can FK fleet_id without
// nulls. It is NOT a managed fleet in the Mode-C sense — riders linked
// to it are still solo/multi-vendor depending on their tenant memberships.
const DEFAULT_FLEET_SLUG = 'hir-default';

// Resolves a rider's operating mode (A=solo / B=multi-vendor / C=fleet-managed)
// from membership data — never via a manual toggle. See
// decision_courier_three_modes.md for the locked rules.
//
//   if courier_profiles.fleet_id points to a NON-default fleet → C
//   elif tenant_members count for user > 1                      → B
//   else                                                         → A
//
// Cheap, server-side, and tolerant of missing rows: a brand-new courier
// with no profile + no memberships returns Mode A so the dashboard
// renders the simplest UI variant.
export async function resolveRiderMode(userId: string): Promise<RiderModeContext> {
  if (!userId) return DEFAULT_CONTEXT;

  const admin = createAdminClient();

  try {
    const [profileRes, membershipRes] = await Promise.all([
      admin
        .from('courier_profiles')
        .select('fleet_id')
        .eq('user_id', userId)
        .maybeSingle(),
      admin
        .from('tenant_members')
        .select('tenant_id', { count: 'exact', head: true })
        .eq('user_id', userId),
    ]);

    const fleetId =
      (profileRes.data as { fleet_id: string | null } | null)?.fleet_id ?? null;
    const tenantCount = membershipRes.count ?? 0;

    if (fleetId) {
      const { data: fleet } = await admin
        .from('courier_fleets')
        .select('slug, name, contact_phone')
        .eq('id', fleetId)
        .maybeSingle();
      const fleetRow = fleet as
        | { slug: string | null; name: string | null; contact_phone: string | null }
        | null;
      const isManagedFleet = fleetRow != null && fleetRow.slug !== DEFAULT_FLEET_SLUG;

      if (isManagedFleet) {
        return {
          mode: 'C',
          fleetId,
          fleetName: fleetRow?.name ?? null,
          fleetContactPhone: fleetRow?.contact_phone ?? null,
          tenantCount,
        };
      }
      // fleet_id points to the platform-default fleet — fall through to
      // tenant_count classification.
    }

    if (tenantCount > 1) {
      return { mode: 'B', fleetId: null, fleetName: null, fleetContactPhone: null, tenantCount };
    }

    return {
      mode: 'A',
      fleetId: null,
      fleetName: null,
      fleetContactPhone: null,
      tenantCount: tenantCount || 1,
    };
  } catch {
    return DEFAULT_CONTEXT;
  }
}
