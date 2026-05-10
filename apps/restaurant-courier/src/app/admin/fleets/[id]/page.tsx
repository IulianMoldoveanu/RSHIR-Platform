// /admin/fleets/[id] — fleet detail + edit + couriers + API keys.
// All writes via server actions; this page is server-rendered (force-dynamic).

import { notFound } from 'next/navigation';
import { requirePlatformAdmin } from '@/lib/platform-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { FleetDetailClient } from './_client';

export const dynamic = 'force-dynamic';

type FleetRow = {
  id: string;
  slug: string;
  name: string;
  brand_color: string;
  tier: string;
  allowed_verticals: string[];
  is_active: boolean;
  created_at: string;
};

type CourierRow = {
  user_id: string;
  full_name: string;
  phone: string;
  status: string;
  created_at: string;
  email: string | null;
};

type ApiKeyRow = {
  id: string;
  label: string;
  key_prefix: string | null;
  scopes: string[];
  last_used_at: string | null;
  is_active: boolean;
  created_at: string;
};

export default async function FleetDetailPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  await requirePlatformAdmin();

  const admin = createAdminClient();
  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
          order: (col: string, opts: { ascending: boolean }) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
        };
      };
    };
  };

  const { data: fleetData, error: fleetErr } = await sb
    .from('courier_fleets')
    .select('id, slug, name, brand_color, tier, allowed_verticals, is_active, created_at')
    .eq('id', params.id)
    .maybeSingle();

  if (fleetErr || !fleetData) return notFound();
  const fleet = fleetData as FleetRow;

  // Couriers in this fleet.
  const { data: profileRows } = await sb
    .from('courier_profiles')
    .select('user_id, full_name, phone, status, created_at')
    .eq('fleet_id', params.id)
    .order('created_at', { ascending: false });

  // Fetch emails for these couriers from auth.users via admin client.
  const profilesTyped: CourierRow[] = ((profileRows ?? []) as Array<{
    user_id: string;
    full_name: string;
    phone: string;
    status: string;
    created_at: string;
  }>).map((p) => ({ ...p, email: null }));

  if (profilesTyped.length > 0) {
    // List all users and match by id.
    const { data: authData } = await (admin as unknown as {
      auth: {
        admin: {
          listUsers: () => Promise<{ data: { users: Array<{ id: string; email: string }> } | null }>;
        };
      };
    }).auth.admin.listUsers();
    const emailMap: Record<string, string> = {};
    for (const u of authData?.users ?? []) {
      emailMap[u.id] = u.email;
    }
    for (const p of profilesTyped) {
      p.email = emailMap[p.user_id] ?? null;
    }
  }

  // API keys for this fleet.
  const { data: keyRows } = await sb
    .from('courier_api_keys')
    .select('id, label, key_prefix, scopes, last_used_at, is_active, created_at')
    .eq('fleet_id', params.id)
    .order('created_at', { ascending: false });

  const apiKeys: ApiKeyRow[] = (keyRows ?? []) as ApiKeyRow[];

  return (
    <FleetDetailClient
      fleet={fleet}
      couriers={profilesTyped}
      apiKeys={apiKeys}
    />
  );
}
