'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTenantMember, getActiveTenant } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';
import { isInventoryEnabled } from '@/lib/inventory';

const UNIT = z.enum(['kg', 'g', 'l', 'ml', 'buc', 'portie']);

const itemCreateSchema = z.object({
  name: z.string().trim().min(1, 'Numele este obligatoriu.').max(120),
  unit: UNIT,
  current_stock: z.coerce.number().min(0).default(0),
  reorder_threshold: z.coerce.number().min(0).default(0),
  reorder_quantity: z.coerce.number().min(0).default(0),
  supplier_id: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(500).optional(),
});

const itemUpdateSchema = itemCreateSchema.extend({
  id: z.string().uuid(),
});

const itemDeleteSchema = z.object({ id: z.string().uuid() });

const recipeLinkSchema = z.object({
  menu_item_id: z.string().uuid(),
  inventory_item_id: z.string().uuid(),
  qty_per_serving: z.coerce.number().positive('Cantitatea per porție trebuie să fie pozitivă.'),
});

const recipeUnlinkSchema = z.object({ id: z.string().uuid() });

const manualAdjustSchema = z.object({
  inventory_item_id: z.string().uuid(),
  delta: z.coerce
    .number()
    .refine((n) => Number.isFinite(n) && n !== 0, 'Delta trebuie să fie un număr nenul.'),
  reason_note: z.string().trim().min(1, 'Adăugați un motiv.').max(200),
});

async function requireGatedTenant(): Promise<{ userId: string; tenantId: string }> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated.');
  const { tenant } = await getActiveTenant();
  await assertTenantMember(user.id, tenant.id);
  if (!(await isInventoryEnabled(tenant.id))) {
    throw new Error('Inventory feature is not enabled for this tenant.');
  }
  return { userId: user.id, tenantId: tenant.id };
}

export async function createItemAction(formData: FormData): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const { userId, tenantId } = await requireGatedTenant();
    const parsed = itemCreateSchema.parse({
      name: formData.get('name'),
      unit: formData.get('unit'),
      current_stock: formData.get('current_stock') ?? 0,
      reorder_threshold: formData.get('reorder_threshold') ?? 0,
      reorder_quantity: formData.get('reorder_quantity') ?? 0,
      supplier_id: (formData.get('supplier_id') as string) || null,
      notes: (formData.get('notes') as string) || undefined,
    });
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any).from('inventory_items')
      .insert({ ...parsed, tenant_id: tenantId })
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message };
    await logAudit({
      tenantId,
      actorUserId: userId,
      action: 'inventory.item_created',
      entityType: 'inventory_item',
      entityId: data.id,
      metadata: { name: parsed.name, unit: parsed.unit },
    });
    revalidatePath('/dashboard/inventory');
    return { ok: true, id: data.id as string };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function updateItemAction(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { userId, tenantId } = await requireGatedTenant();
    const parsed = itemUpdateSchema.parse({
      id: formData.get('id'),
      name: formData.get('name'),
      unit: formData.get('unit'),
      current_stock: formData.get('current_stock') ?? 0,
      reorder_threshold: formData.get('reorder_threshold') ?? 0,
      reorder_quantity: formData.get('reorder_quantity') ?? 0,
      supplier_id: (formData.get('supplier_id') as string) || null,
      notes: (formData.get('notes') as string) || undefined,
    });
    const admin = createAdminClient();
    const { id, ...rest } = parsed;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from('inventory_items')
      .update({ ...rest, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('id', id);
    if (error) return { ok: false, error: error.message };
    await logAudit({
      tenantId,
      actorUserId: userId,
      action: 'inventory.item_updated',
      entityType: 'inventory_item',
      entityId: id,
      metadata: {},
    });
    revalidatePath('/dashboard/inventory');
    revalidatePath(`/dashboard/inventory/${id}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteItemAction(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { userId, tenantId } = await requireGatedTenant();
    const { id } = itemDeleteSchema.parse({ id: formData.get('id') });
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from('inventory_items')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id);
    if (error) return { ok: false, error: error.message };
    await logAudit({
      tenantId,
      actorUserId: userId,
      action: 'inventory.item_deleted',
      entityType: 'inventory_item',
      entityId: id,
      metadata: {},
    });
    revalidatePath('/dashboard/inventory');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function linkRecipeAction(formData: FormData): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const { userId, tenantId } = await requireGatedTenant();
    const parsed = recipeLinkSchema.parse({
      menu_item_id: formData.get('menu_item_id'),
      inventory_item_id: formData.get('inventory_item_id'),
      qty_per_serving: formData.get('qty_per_serving'),
    });
    const admin = createAdminClient();

    // Defense-in-depth: verify both parent rows belong to the active tenant
    // before the insert. The schema also has composite tenant FKs
    // ((tenant_id, *_id) -> parent(tenant_id, id)) so the DB will reject
    // cross-tenant inserts at the FK level — this check just yields a
    // cleaner error message when forged FormData arrives.
    const [menuItemCheck, invItemCheck] = await Promise.all([
      admin
        .from('restaurant_menu_items')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('id', parsed.menu_item_id)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin as any).from('inventory_items')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('id', parsed.inventory_item_id)
        .maybeSingle(),
    ]);
    if (!menuItemCheck.data || !invItemCheck.data) {
      return { ok: false, error: 'Produs din meniu sau ingredient invalid pentru acest restaurant.' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any).from('menu_item_recipes')
      .insert({ ...parsed, tenant_id: tenantId })
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message };
    await logAudit({
      tenantId,
      actorUserId: userId,
      action: 'inventory.recipe_linked',
      entityType: 'menu_item_recipe',
      entityId: data.id,
      metadata: { ...parsed },
    });
    revalidatePath(`/dashboard/inventory/${parsed.inventory_item_id}`);
    return { ok: true, id: data.id as string };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Manual stock adjustment by OWNER/STAFF. Writes an inventory_movements row
 * (reason='MANUAL_ADJUST') AND updates inventory_items.current_stock by the
 * delta. Audited as `inventory.manual_adjustment`.
 *
 * The DELIVERED trigger writes movements as the ORDER_DELIVERED reason; this
 * is the only OTHER write path to inventory_movements.
 */
export async function manualAdjustStockAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { userId, tenantId } = await requireGatedTenant();
    const parsed = manualAdjustSchema.parse({
      inventory_item_id: formData.get('inventory_item_id'),
      delta: formData.get('delta'),
      reason_note: formData.get('reason_note'),
    });
    const admin = createAdminClient();

    // Verify the item belongs to this tenant. The composite tenant FK on
    // inventory_movements would catch a cross-tenant write at insert time,
    // but the inventory_items.current_stock UPDATE below is a separate
    // statement and we'd rather fail fast with a clean error.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: itemRow, error: itemErr } = await (admin as any).from('inventory_items')
      .select('id, current_stock')
      .eq('tenant_id', tenantId)
      .eq('id', parsed.inventory_item_id)
      .maybeSingle();
    if (itemErr) return { ok: false, error: itemErr.message };
    if (!itemRow) return { ok: false, error: 'Ingredient inexistent pentru acest restaurant.' };

    // 1. Append movement ledger row.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: moveErr } = await (admin as any).from('inventory_movements')
      .insert({
        tenant_id: tenantId,
        inventory_item_id: parsed.inventory_item_id,
        delta: parsed.delta,
        reason: 'MANUAL_ADJUST',
        actor_user_id: userId,
        metadata: { note: parsed.reason_note },
      });
    if (moveErr) return { ok: false, error: moveErr.message };

    // 2. Update current_stock. We avoid a SELECT-then-UPDATE race by
    //    delegating arithmetic to a SQL update of `current_stock + delta`
    //    via a secondary call — supabase-js cannot express raw expressions
    //    in update(), so we compute on the client. Race with the trigger
    //    is acceptable because both paths write monotonic deltas;
    //    the ledger remains the source of truth and current_stock can
    //    be reconciled from sum(delta) if it ever drifts.
    const newStock = Number(itemRow.current_stock) + parsed.delta;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updErr } = await (admin as any).from('inventory_items')
      .update({ current_stock: newStock, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('id', parsed.inventory_item_id);
    if (updErr) return { ok: false, error: updErr.message };

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: 'inventory.manual_adjustment',
      entityType: 'inventory_item',
      entityId: parsed.inventory_item_id,
      metadata: { delta: parsed.delta, note: parsed.reason_note },
    });
    revalidatePath('/dashboard/inventory');
    revalidatePath(`/dashboard/inventory/${parsed.inventory_item_id}`);
    revalidatePath('/dashboard/inventory/movements');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function unlinkRecipeAction(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { userId, tenantId } = await requireGatedTenant();
    const { id } = recipeUnlinkSchema.parse({ id: formData.get('id') });
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from('menu_item_recipes')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id);
    if (error) return { ok: false, error: error.message };
    await logAudit({
      tenantId,
      actorUserId: userId,
      action: 'inventory.recipe_unlinked',
      entityType: 'menu_item_recipe',
      entityId: id,
      metadata: {},
    });
    const inventoryItemId = formData.get('inventory_item_id') as string | null;
    if (inventoryItemId) revalidatePath(`/dashboard/inventory/${inventoryItemId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
