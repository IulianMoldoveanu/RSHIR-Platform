import { createAdminClient } from './supabase/admin';

export type RiderMode = 'A' | 'B' | 'C';

export type RiderModeContext = {
  mode: RiderMode;
  fleetId: string | null;
  fleetName: string | null;
  tenantCount: number;
};

const DEFAULT_CONTEXT: RiderModeContext = {
  mode: 'A',
  fleetId: null,
  fleetName: null,
  tenantCount: 1,
};

// Resolves a rider's operating mode (A=solo / B=multi-vendor / C=fleet-managed)
// from membership data — never via a manual toggle. See
// decision_courier_three_modes.md for the locked rules.
//
//   if courier_profiles.fleet_id IS NOT NULL → C
//   elif tenant_members count for user > 1   → B
//   else                                      → A
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
        .select('name')
        .eq('id', fleetId)
        .maybeSingle();
      return {
        mode: 'C',
        fleetId,
        fleetName: (fleet as { name: string | null } | null)?.name ?? null,
        tenantCount,
      };
    }

    if (tenantCount > 1) {
      return { mode: 'B', fleetId: null, fleetName: null, tenantCount };
    }

    return { mode: 'A', fleetId: null, fleetName: null, tenantCount: tenantCount || 1 };
  } catch {
    return DEFAULT_CONTEXT;
  }
}
