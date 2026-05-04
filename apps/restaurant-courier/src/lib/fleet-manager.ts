// Auth helper for fleet-manager-only pages and server actions.
// A user is considered a fleet manager when they own a row in
// `courier_fleets.owner_user_id`. Per the schema this is a 1:1 relation
// today (a user can own at most one fleet); migration 20260603_002 does
// add a tenant_members.role='FLEET_MANAGER' path for tenant-scoped
// dispatch, but no UI-side user has been wired into that yet so we
// keep the simpler `owner_user_id` lookup as the single source of truth.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type FleetContext = {
  userId: string;
  fleetId: string;
  slug: string;
  name: string;
  brandColor: string | null;
  contactPhone: string | null;
  isActive: boolean;
};

type FleetRow = {
  id: string;
  slug: string;
  name: string;
  brand_color: string | null;
  contact_phone: string | null;
  is_active: boolean;
};

export async function requireFleetManager(): Promise<FleetContext> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data } = await admin
    .from('courier_fleets')
    .select('id, slug, name, brand_color, contact_phone, is_active')
    .eq('owner_user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const fleet = data as FleetRow | null;
  if (!fleet) redirect('/dashboard');

  return {
    userId: user.id,
    fleetId: fleet.id,
    slug: fleet.slug,
    name: fleet.name,
    brandColor: fleet.brand_color,
    contactPhone: fleet.contact_phone,
    isActive: fleet.is_active,
  };
}

/** Soft variant for server actions — returns null instead of redirecting. */
export async function getFleetManagerContext(): Promise<FleetContext | null> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from('courier_fleets')
    .select('id, slug, name, brand_color, contact_phone, is_active')
    .eq('owner_user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const fleet = data as FleetRow | null;
  if (!fleet) return null;

  return {
    userId: user.id,
    fleetId: fleet.id,
    slug: fleet.slug,
    name: fleet.name,
    brandColor: fleet.brand_color,
    contactPhone: fleet.contact_phone,
    isActive: fleet.is_active,
  };
}
