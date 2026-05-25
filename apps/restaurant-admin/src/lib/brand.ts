// Multi-location brand family helpers.
// Schema: tenants.parent_brand_id self-FK + tenant_brand_family view
// (see supabase/migrations/20260526_001_tenant_parent_brand.sql).

import { createAdminClient } from './supabase/admin';

export type BrandFamilyMember = {
  tenantId: string;
  brandRootId: string;
  roleInBrand: 'ROOT' | 'SIBLING';
  name: string;
  slug: string;
  cityId: string | null;
  deliveryMode: 'full_saas' | 'headless';
  status: string;
};

export type LocationKpi = {
  tenantId: string;
  name: string;
  slug: string;
  cityName: string | null;
  ordersTotal: number;
  ordersDelivered: number;
  revenueRon: number;
  avgOrderValueRon: number;
};

export type BrandAggregateKpis = {
  brandRootId: string;
  brandRootName: string;
  locationCount: number;
  ordersTotal: number;
  ordersDelivered: number;
  revenueRon: number;
  avgOrderValueRon: number;
  perLocation: LocationKpi[];
  /** ISO date range used for the rollup; inclusive start, exclusive end. */
  windowStart: string;
  windowEnd: string;
};

type TbfRow = {
  tenant_id: string;
  brand_root_id: string;
  role_in_brand: 'ROOT' | 'SIBLING';
  name: string;
  slug: string;
  city_id: string | null;
  delivery_mode: 'full_saas' | 'headless';
  status: string;
};

/**
 * Returns all tenants that share the same brand root as `tenantId`.
 * If the tenant is standalone (parent_brand_id IS NULL and no siblings
 * point to it), the result is a single-element list with role ROOT.
 */
export async function getBrandFamily(tenantId: string): Promise<BrandFamilyMember[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: rootRow, error: rootErr } = await admin
    .from('tenant_brand_family')
    .select('brand_root_id')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (rootErr || !rootRow) return [];

  const rootId = (rootRow as { brand_root_id: string }).brand_root_id;
  const { data, error } = await admin
    .from('tenant_brand_family')
    .select(
      'tenant_id, brand_root_id, role_in_brand, name, slug, city_id, delivery_mode, status',
    )
    .eq('brand_root_id', rootId)
    .order('role_in_brand', { ascending: true })
    .order('name', { ascending: true });

  if (error || !data) return [];

  return (data as TbfRow[]).map((r) => ({
    tenantId: r.tenant_id,
    brandRootId: r.brand_root_id,
    roleInBrand: r.role_in_brand,
    name: r.name,
    slug: r.slug,
    cityId: r.city_id,
    deliveryMode: r.delivery_mode,
    status: r.status,
  }));
}

/**
 * True when the brand family has 2+ active members. Used to gate the
 * "Brand (multi-locație)" sidebar entry and the /dashboard/brand view.
 */
export async function hasMultipleLocations(tenantId: string): Promise<boolean> {
  const family = await getBrandFamily(tenantId);
  return family.filter((m) => m.status === 'ACTIVE').length >= 2;
}

/**
 * Rolls up KPI for every location in the brand family of `tenantId` over
 * the [windowStart, windowEnd) window. Considers only DELIVERED orders
 * for revenue + AOV; ordersTotal counts all non-CANCELLED.
 */
export async function getBrandAggregateKpis(
  tenantId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<BrandAggregateKpis | null> {
  const family = await getBrandFamily(tenantId);
  if (family.length === 0) return null;

  const root = family.find((m) => m.roleInBrand === 'ROOT');
  const tenantIds = family.map((m) => m.tenantId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Pull orders for all family tenants in window. Cap a sensible upper
  // limit to avoid OOM if a misconfigured query hits prod.
  const { data: orders } = await admin
    .from('restaurant_orders')
    .select('tenant_id, status, total_ron, created_at')
    .in('tenant_id', tenantIds)
    .gte('created_at', windowStart.toISOString())
    .lt('created_at', windowEnd.toISOString())
    .neq('status', 'CANCELLED')
    .limit(50000);

  type OrderRow = {
    tenant_id: string;
    status: string;
    total_ron: string | number;
  };

  const byTenant = new Map<string, { total: number; delivered: number; revenue: number }>();
  for (const m of family) byTenant.set(m.tenantId, { total: 0, delivered: 0, revenue: 0 });

  for (const o of (orders ?? []) as OrderRow[]) {
    const bucket = byTenant.get(o.tenant_id);
    if (!bucket) continue;
    bucket.total += 1;
    if (o.status === 'DELIVERED') {
      bucket.delivered += 1;
      bucket.revenue += Number(o.total_ron) || 0;
    }
  }

  // Optional: resolve city names. Cities table is reference data; if it
  // doesn't exist or query fails, we just leave cityName=null per row.
  const cityIds = Array.from(new Set(family.map((m) => m.cityId).filter((x): x is string => !!x)));
  const cityNames = new Map<string, string>();
  if (cityIds.length > 0) {
    const { data: cityRows } = await admin
      .from('cities')
      .select('id, name')
      .in('id', cityIds);
    for (const c of (cityRows ?? []) as Array<{ id: string; name: string }>) {
      cityNames.set(c.id, c.name);
    }
  }

  const perLocation: LocationKpi[] = family.map((m) => {
    const b = byTenant.get(m.tenantId) ?? { total: 0, delivered: 0, revenue: 0 };
    const aov = b.delivered > 0 ? b.revenue / b.delivered : 0;
    return {
      tenantId: m.tenantId,
      name: m.name,
      slug: m.slug,
      cityName: m.cityId ? cityNames.get(m.cityId) ?? null : null,
      ordersTotal: b.total,
      ordersDelivered: b.delivered,
      revenueRon: b.revenue,
      avgOrderValueRon: aov,
    };
  });

  const totals = perLocation.reduce(
    (acc, l) => {
      acc.ordersTotal += l.ordersTotal;
      acc.ordersDelivered += l.ordersDelivered;
      acc.revenueRon += l.revenueRon;
      return acc;
    },
    { ordersTotal: 0, ordersDelivered: 0, revenueRon: 0 },
  );

  return {
    brandRootId: root?.tenantId ?? family[0].brandRootId,
    brandRootName: root?.name ?? family[0].name,
    locationCount: family.length,
    ordersTotal: totals.ordersTotal,
    ordersDelivered: totals.ordersDelivered,
    revenueRon: totals.revenueRon,
    avgOrderValueRon:
      totals.ordersDelivered > 0 ? totals.revenueRon / totals.ordersDelivered : 0,
    perLocation,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  };
}
