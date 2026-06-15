// Single source of truth for post-login role detection on the admin app.
//
// The admin app hosts 3 distinct user surfaces (Iulian directive 2026-06-15):
//
//   role          surface                landing
//   ───────────── ────────────────────── ─────────────────────
//   RESTAURANT    /dashboard             (current restaurant CMS)
//   FLEET         /fleet                 (fleet manager KYF + ops)
//   RESELLER      /partner-portal        (existing partner portal)
//   PLATFORM_ADMIN                       (admin sees the admin nav inside /dashboard)
//   NONE          /signup                (offer onboarding)
//
// A user can hold multiple roles (a partner can also own a fleet). The
// PRIMARY role is the one we redirect to from login; the user can switch
// via the sidebar. Precedence order favours the most "earnest" surface —
// tenant membership first (active operator), then fleet (operator-in-
// onboarding), then reseller (passive growth surface).

import { createAdminClient } from '@/lib/supabase/admin';

export type UserRole = 'RESTAURANT' | 'FLEET' | 'RESELLER' | 'PLATFORM_ADMIN' | 'NONE';

export type UserRoleSnapshot = {
  primary: UserRole;
  isTenantMember: boolean;
  isFleetOwner: boolean;
  isReseller: boolean;
  fleetId: string | null;
  fleetKyfStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
  partnerStatus: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | null;
};

const LANDINGS: Record<UserRole, string> = {
  RESTAURANT: '/dashboard',
  FLEET: '/fleet',
  RESELLER: '/partner-portal',
  PLATFORM_ADMIN: '/dashboard',
  NONE: '/signup',
};

export function roleLanding(role: UserRole): string {
  return LANDINGS[role];
}

/**
 * Detect what surfaces a user has access to. Uses the service-role client
 * (bypasses RLS) so we can read across `tenant_members`, `courier_fleets`,
 * `fleet_kyf`, and `partners` in a single trip.
 *
 * Safe to call from any server component: no side effects, three SELECTs.
 */
export async function getUserRoleSnapshot(userId: string): Promise<UserRoleSnapshot> {
  const admin = createAdminClient();

  const [tenantMembership, fleet, partner] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from('courier_fleets')
      .select('id, fleet_kyf:fleet_kyf(kyf_status)')
      .eq('owner_user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from('partners')
      .select('id, status')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle(),
  ]);

  const isTenantMember = Boolean(tenantMembership.data?.tenant_id);
  const isFleetOwner = Boolean(fleet.data?.id);
  const isReseller = Boolean(partner.data?.id);

  // fleet_kyf is a 1:1 child of courier_fleets — embed returns either an
  // object or null depending on whether the seed row exists.
  const kyfRaw = fleet.data?.fleet_kyf;
  const fleetKyfStatus =
    (Array.isArray(kyfRaw) ? kyfRaw[0]?.kyf_status : kyfRaw?.kyf_status) ?? null;

  const partnerStatus = partner.data?.status ?? null;

  // Precedence: TENANT > FLEET > RESELLER. Platform admin is layered ON TOP
  // (their email is on the allow-list) — they get the admin nav in /dashboard
  // regardless of which primary role they also happen to hold.
  let primary: UserRole = 'NONE';
  if (isTenantMember) primary = 'RESTAURANT';
  else if (isFleetOwner) primary = 'FLEET';
  else if (isReseller) primary = 'RESELLER';

  return {
    primary,
    isTenantMember,
    isFleetOwner,
    isReseller,
    fleetId: fleet.data?.id ?? null,
    fleetKyfStatus,
    partnerStatus,
  };
}
