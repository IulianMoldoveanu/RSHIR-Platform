// Resolves a batch of tenant ids → display names for fleet-manager surfaces.
//
// Fleet managers handle orders from multiple HIR tenants (restaurants) at
// once. Without the tenant name on each row the dispatcher can't tell who
// the pickup belongs to — the pickup address line alone is ambiguous when
// the same building hosts >1 venue. Cheap to query (`id in (...)`) and
// kept to one round-trip per page render.
//
// Returns an empty map when called with no ids, so callers can chain
// `.get(id) ?? null` safely.

import { createAdminClient } from './supabase/admin';

export async function resolveTenantNames(
  tenantIds: ReadonlyArray<string | null>,
): Promise<Map<string, string>> {
  const ids = Array.from(
    new Set(tenantIds.filter((id): id is string => typeof id === 'string' && id.length > 0)),
  );
  if (ids.length === 0) return new Map();

  const admin = createAdminClient();
  const { data } = await admin.from('tenants').select('id, name').in('id', ids);
  const rows = (data ?? []) as Array<{ id: string; name: string | null }>;
  const map = new Map<string, string>();
  for (const r of rows) {
    if (r.name) map.set(r.id, r.name);
  }
  return map;
}
