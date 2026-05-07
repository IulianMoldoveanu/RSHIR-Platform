// Inventory v1 (Premium tier) — server-side helpers for the
// /dashboard/inventory surfaces. Wraps supabase admin client with
// tenant-scoped queries. All callers must have already verified
// tenant membership via assertTenantMember.

import { createAdminClient } from './supabase/admin';

export type InventoryUnit = 'kg' | 'g' | 'l' | 'ml' | 'buc' | 'portie';

export type InventoryItem = {
  id: string;
  tenant_id: string;
  name: string;
  unit: InventoryUnit;
  current_stock: number;
  reorder_threshold: number;
  reorder_quantity: number;
  supplier_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type RecipeLink = {
  id: string;
  menu_item_id: string;
  inventory_item_id: string;
  qty_per_serving: number;
  menu_item_name?: string | null;
  inventory_item_name?: string | null;
  inventory_item_unit?: InventoryUnit | null;
};

export type Supplier = {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

export type MovementReason =
  | 'ORDER_DELIVERED'
  | 'MANUAL_ADJUST'
  | 'PURCHASE_RECEIVED'
  | 'WASTE'
  | 'INITIAL_STOCK';

export type InventoryMovement = {
  id: string;
  tenant_id: string;
  inventory_item_id: string;
  delta: number;
  reason: MovementReason;
  order_id: string | null;
  actor_user_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  inventory_item_name?: string | null;
  inventory_item_unit?: InventoryUnit | null;
};

/**
 * Reads the inventory_enabled feature flag from tenants.feature_flags JSONB.
 * Tenants opt in to Premium inventory features per-tenant. Falsy result =
 * upsell page; truthy = full inventory UI.
 */
export async function isInventoryEnabled(tenantId: string): Promise<boolean> {
  const admin = createAdminClient();
  // feature_flags JSONB column added by migration 20260506_013, not yet in
  // generated supabase types; cast through unknown.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin.from('tenants') as any)
    .select('feature_flags')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) {
    console.error('[inventory] feature_flags read failed:', error.message);
    return false;
  }
  const flags = (data?.feature_flags ?? {}) as Record<string, unknown>;
  return flags.inventory_enabled === true || flags.inventory_enabled === 'true';
}

export async function listInventoryItems(tenantId: string): Promise<InventoryItem[]> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).from('inventory_items')
    .select('id, tenant_id, name, unit, current_stock, reorder_threshold, reorder_quantity, supplier_id, notes, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true });
  if (error) throw new Error(`Inventory items list failed: ${error.message}`);
  return (data ?? []) as InventoryItem[];
}

export async function getInventoryItem(
  tenantId: string,
  itemId: string,
): Promise<InventoryItem | null> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).from('inventory_items')
    .select('id, tenant_id, name, unit, current_stock, reorder_threshold, reorder_quantity, supplier_id, notes, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .eq('id', itemId)
    .maybeSingle();
  if (error) throw new Error(`Inventory item read failed: ${error.message}`);
  return (data as InventoryItem | null) ?? null;
}

/**
 * All recipes that consume `itemId` for `tenantId`. Used on the detail
 * page to show "linked to N menu items".
 */
export async function listRecipesForItem(
  tenantId: string,
  itemId: string,
): Promise<RecipeLink[]> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).from('menu_item_recipes')
    .select('id, menu_item_id, inventory_item_id, qty_per_serving, restaurant_menu_items!inner(name)')
    .eq('tenant_id', tenantId)
    .eq('inventory_item_id', itemId);
  if (error) throw new Error(`Recipe list failed: ${error.message}`);
  return ((data ?? []) as Array<RecipeLink & { restaurant_menu_items?: { name: string } | null }>).map((row) => ({
    id: row.id,
    menu_item_id: row.menu_item_id,
    inventory_item_id: row.inventory_item_id,
    qty_per_serving: row.qty_per_serving,
    menu_item_name: row.restaurant_menu_items?.name ?? null,
  }));
}

export async function listSuppliers(tenantId: string): Promise<Supplier[]> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).from('suppliers')
    .select('id, tenant_id, name, email, phone')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true });
  if (error) throw new Error(`Suppliers list failed: ${error.message}`);
  return (data ?? []) as Supplier[];
}

/**
 * Menu items available to link to inventory (used in the recipe-link form
 * on the item-detail page). Filters out items already linked to this
 * inventory item — caller passes already-linked menu_item_ids.
 */
/**
 * Latest inventory_movements rows for the tenant. Supports optional reason
 * filter and item filter. Always ordered desc by created_at, capped to
 * `limit` (default 100). Joins inventory_items to surface name + unit so
 * the ledger UI does not have to do a second round-trip.
 */
export async function listMovements(
  tenantId: string,
  opts: {
    reason?: MovementReason | null;
    inventoryItemId?: string | null;
    limit?: number;
  } = {},
): Promise<InventoryMovement[]> {
  const admin = createAdminClient();
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = (admin as any).from('inventory_movements')
    .select(
      'id, tenant_id, inventory_item_id, delta, reason, order_id, actor_user_id, metadata, created_at, inventory_items!inner(name, unit)',
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (opts.reason) q = q.eq('reason', opts.reason);
  if (opts.inventoryItemId) q = q.eq('inventory_item_id', opts.inventoryItemId);
  const { data, error } = await q;
  if (error) throw new Error(`Inventory movements list failed: ${error.message}`);
  return ((data ?? []) as Array<
    InventoryMovement & { inventory_items?: { name: string; unit: InventoryUnit } | null }
  >).map((row) => ({
    id: row.id,
    tenant_id: row.tenant_id,
    inventory_item_id: row.inventory_item_id,
    delta: Number(row.delta),
    reason: row.reason,
    order_id: row.order_id,
    actor_user_id: row.actor_user_id,
    metadata: row.metadata,
    created_at: row.created_at,
    inventory_item_name: row.inventory_items?.name ?? null,
    inventory_item_unit: row.inventory_items?.unit ?? null,
  }));
}

/**
 * Counts movements for the tenant. Used on the OWNER toggle page so the
 * user sees impact ("X mișcări înregistrate") before disabling the module.
 * Uses head: true / count: 'exact' for an O(1) count.
 */
export async function countMovements(tenantId: string): Promise<number> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (admin as any).from('inventory_movements')
    .select('id', { head: true, count: 'exact' })
    .eq('tenant_id', tenantId);
  if (error) {
    console.error('[inventory] count movements failed:', error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Counts inventory_items rows for the tenant. Used in the OWNER toggle
 * page so OWNERs see how many ingredients are tracked before disabling.
 */
export async function countInventoryItems(tenantId: string): Promise<number> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (admin as any).from('inventory_items')
    .select('id', { head: true, count: 'exact' })
    .eq('tenant_id', tenantId);
  if (error) {
    console.error('[inventory] count items failed:', error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Flips tenants.feature_flags.inventory_enabled. Caller MUST have already
 * verified OWNER role. Preserves existing flag keys; only mutates this one.
 */
export async function setInventoryEnabled(
  tenantId: string,
  enabled: boolean,
): Promise<void> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row, error: readErr } = await (admin.from('tenants') as any)
    .select('feature_flags')
    .eq('id', tenantId)
    .maybeSingle();
  if (readErr) throw new Error(`Read feature_flags failed: ${readErr.message}`);
  const current = ((row?.feature_flags as Record<string, unknown> | null) ?? {});
  const next = { ...current, inventory_enabled: enabled };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: writeErr } = await (admin.from('tenants') as any)
    .update({ feature_flags: next })
    .eq('id', tenantId);
  if (writeErr) throw new Error(`Write feature_flags failed: ${writeErr.message}`);
}

export async function listLinkableMenuItems(
  tenantId: string,
  excludeMenuItemIds: string[] = [],
): Promise<Array<{ id: string; name: string }>> {
  const admin = createAdminClient();
  let q = admin
    .from('restaurant_menu_items')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true });
  if (excludeMenuItemIds.length > 0) {
    q = q.not('id', 'in', `(${excludeMenuItemIds.map((s) => `"${s}"`).join(',')})`);
  }
  const { data, error } = await q;
  if (error) throw new Error(`Menu items list failed: ${error.message}`);
  return (data ?? []) as Array<{ id: string; name: string }>;
}
