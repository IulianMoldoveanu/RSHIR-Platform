'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import type { Database } from '@hir/supabase-types/database';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type MenuItemUpdate = Database['public']['Tables']['restaurant_menu_items']['Update'];
import { assertTenantMember, getActiveTenant } from '@/lib/tenant';
import {
  categoryCreateSchema,
  categoryDeleteSchema,
  categoryReorderSchema,
  categoryToggleSchema,
  categoryUpdateSchema,
  csvImportSchema,
  itemAvailabilitySchema,
  itemBulkAvailabilitySchema,
  itemCreateSchema,
  itemDeleteSchema,
  itemUpdateSchema,
  modifierCreateSchema,
  modifierDeleteSchema,
  modifierUpdateSchema,
} from './schemas';

const MENU_BUCKET = 'menu-images';
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

async function requireTenant(): Promise<{ userId: string; tenantId: string }> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated.');
  const { tenant } = await getActiveTenant();
  await assertTenantMember(user.id, tenant.id);
  return { userId: user.id, tenantId: tenant.id };
}

function publicUrlFor(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return `${base}/storage/v1/object/public/${MENU_BUCKET}/${path}`;
}

async function uploadImage(
  tenantId: string,
  itemId: string,
  file: File,
): Promise<string> {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error(`Tip imagine neacceptat: ${file.type}`);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Imaginea depaseste 5 MB.');
  }
  const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
  const path = `${tenantId}/${itemId}.${ext}`;
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(MENU_BUCKET)
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: true,
    });
  if (error) throw new Error(`Upload imagine esuat: ${error.message}`);
  return publicUrlFor(path);
}

// ============================================================
// CATEGORIES
// ============================================================

export async function createCategoryAction(formData: FormData) {
  const { tenantId } = await requireTenant();
  const parsed = categoryCreateSchema.parse({ name: formData.get('name') });
  const admin = createAdminClient();

  const { data: maxRow } = await admin
    .from('restaurant_menu_categories')
    .select('sort_order')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { error } = await admin.from('restaurant_menu_categories').insert({
    tenant_id: tenantId,
    name: parsed.name,
    sort_order: nextOrder,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/menu');
}

export async function updateCategoryAction(formData: FormData) {
  const { tenantId } = await requireTenant();
  const parsed = categoryUpdateSchema.parse({
    id: formData.get('id'),
    name: formData.get('name'),
  });
  const admin = createAdminClient();
  const { error } = await admin
    .from('restaurant_menu_categories')
    .update({ name: parsed.name })
    .eq('id', parsed.id)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/menu');
}

export async function toggleCategoryActiveAction(formData: FormData) {
  const { tenantId } = await requireTenant();
  const parsed = categoryToggleSchema.parse({
    id: formData.get('id'),
    is_active: formData.get('is_active') === 'true',
  });
  const admin = createAdminClient();
  const { error } = await admin
    .from('restaurant_menu_categories')
    .update({ is_active: parsed.is_active })
    .eq('id', parsed.id)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/menu');
}

export async function deleteCategoryAction(formData: FormData) {
  const { tenantId } = await requireTenant();
  const parsed = categoryDeleteSchema.parse({ id: formData.get('id') });
  const admin = createAdminClient();
  // Soft-delete: just flip is_active. Cascading hard-delete would orphan items.
  const { error } = await admin
    .from('restaurant_menu_categories')
    .update({ is_active: false })
    .eq('id', parsed.id)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/menu');
}

export async function reorderCategoriesAction(ids: string[]): Promise<void> {
  const { tenantId } = await requireTenant();
  const parsed = categoryReorderSchema.parse({ ids });
  const admin = createAdminClient();
  for (let i = 0; i < parsed.ids.length; i++) {
    const { error } = await admin
      .from('restaurant_menu_categories')
      .update({ sort_order: i })
      .eq('id', parsed.ids[i])
      .eq('tenant_id', tenantId);
    if (error) throw new Error(error.message);
  }
  revalidatePath('/dashboard/menu');
}

// ============================================================
// ITEMS
// ============================================================

export async function createItemAction(formData: FormData) {
  const { tenantId } = await requireTenant();
  const parsed = itemCreateSchema.parse({
    name: formData.get('name'),
    description: formData.get('description'),
    price_ron: formData.get('price_ron'),
    category_id: formData.get('category_id'),
    tags: formData.get('tags') ?? '',
    is_available: formData.get('is_available'),
  });

  const admin = createAdminClient();

  // Verify category belongs to this tenant.
  const { data: cat, error: catErr } = await admin
    .from('restaurant_menu_categories')
    .select('id')
    .eq('id', parsed.category_id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (catErr) throw new Error(catErr.message);
  if (!cat) throw new Error('Categorie inexistenta.');

  const itemId = randomUUID();
  let imageUrl: string | null = null;
  const file = formData.get('image');
  if (file instanceof File && file.size > 0) {
    imageUrl = await uploadImage(tenantId, itemId, file);
  }

  const { error } = await admin.from('restaurant_menu_items').insert({
    id: itemId,
    tenant_id: tenantId,
    category_id: parsed.category_id,
    name: parsed.name,
    description: (parsed.description || null) as string | null,
    price_ron: parsed.price_ron,
    image_url: imageUrl,
    is_available: parsed.is_available,
    tags: parsed.tags ?? [],
  });
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/menu');
}

export async function updateItemAction(formData: FormData) {
  const { tenantId } = await requireTenant();
  const parsed = itemUpdateSchema.parse({
    id: formData.get('id'),
    name: formData.get('name'),
    description: formData.get('description'),
    price_ron: formData.get('price_ron'),
    category_id: formData.get('category_id'),
    tags: formData.get('tags') ?? '',
    is_available: formData.get('is_available'),
  });

  const admin = createAdminClient();

  const { data: existing, error: existErr } = await admin
    .from('restaurant_menu_items')
    .select('id, is_available')
    .eq('id', parsed.id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (existErr) throw new Error(existErr.message);
  if (!existing) throw new Error('Produsul nu exista.');

  let imageUrl: string | undefined = undefined;
  const file = formData.get('image');
  if (file instanceof File && file.size > 0) {
    imageUrl = await uploadImage(tenantId, parsed.id, file);
  }

  const update: MenuItemUpdate = {
    name: parsed.name,
    description: parsed.description || null,
    price_ron: parsed.price_ron,
    category_id: parsed.category_id,
    tags: parsed.tags ?? [],
    is_available: parsed.is_available,
  };
  if (imageUrl !== undefined) update.image_url = imageUrl;

  const { error } = await admin
    .from('restaurant_menu_items')
    .update(update)
    .eq('id', parsed.id)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(error.message);

  // If availability flipped here, broadcast.
  if (existing.is_available !== parsed.is_available) {
    await admin.from('menu_events').insert({
      tenant_id: tenantId,
      item_id: parsed.id,
      is_available: parsed.is_available,
    });
  }
  revalidatePath('/dashboard/menu');
}

export async function deleteItemAction(formData: FormData) {
  const { tenantId } = await requireTenant();
  const parsed = itemDeleteSchema.parse({ id: formData.get('id') });
  const admin = createAdminClient();
  const { error } = await admin
    .from('restaurant_menu_items')
    .delete()
    .eq('id', parsed.id)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/menu');
}

export async function toggleItemAvailabilityAction(input: {
  id: string;
  is_available: boolean;
}) {
  const { tenantId } = await requireTenant();
  const parsed = itemAvailabilitySchema.parse(input);
  const admin = createAdminClient();

  const { error } = await admin
    .from('restaurant_menu_items')
    .update({ is_available: parsed.is_available })
    .eq('id', parsed.id)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(error.message);

  await admin.from('menu_events').insert({
    tenant_id: tenantId,
    item_id: parsed.id,
    is_available: parsed.is_available,
  });
  revalidatePath('/dashboard/menu');
}

export async function bulkToggleAvailabilityAction(input: {
  ids: string[];
  is_available: boolean;
}) {
  const { tenantId } = await requireTenant();
  const parsed = itemBulkAvailabilitySchema.parse(input);
  const admin = createAdminClient();

  const { error } = await admin
    .from('restaurant_menu_items')
    .update({ is_available: parsed.is_available })
    .in('id', parsed.ids)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(error.message);

  const events = parsed.ids.map((id) => ({
    tenant_id: tenantId,
    item_id: id,
    is_available: parsed.is_available,
  }));
  await admin.from('menu_events').insert(events);
  revalidatePath('/dashboard/menu');
}

// ============================================================
// MODIFIERS
// ============================================================

async function assertItemBelongsToTenant(itemId: string, tenantId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('restaurant_menu_items')
    .select('id')
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Produsul nu exista in acest restaurant.');
}

export async function createModifierAction(formData: FormData) {
  const { tenantId } = await requireTenant();
  const parsed = modifierCreateSchema.parse({
    item_id: formData.get('item_id'),
    name: formData.get('name'),
    price_delta_ron: formData.get('price_delta_ron'),
  });
  await assertItemBelongsToTenant(parsed.item_id, tenantId);
  const admin = createAdminClient();
  const { error } = await admin.from('restaurant_menu_modifiers').insert(parsed);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/menu');
}

export async function updateModifierAction(formData: FormData) {
  const { tenantId } = await requireTenant();
  const parsed = modifierUpdateSchema.parse({
    id: formData.get('id'),
    name: formData.get('name'),
    price_delta_ron: formData.get('price_delta_ron'),
  });
  const admin = createAdminClient();
  // Confirm the modifier's item belongs to this tenant.
  const { data: mod, error: modErr } = await admin
    .from('restaurant_menu_modifiers')
    .select('item_id, restaurant_menu_items!inner(tenant_id)')
    .eq('id', parsed.id)
    .maybeSingle();
  if (modErr) throw new Error(modErr.message);
  const ownerTenant = (mod as unknown as { restaurant_menu_items?: { tenant_id?: string } } | null)
    ?.restaurant_menu_items?.tenant_id;
  if (!mod || ownerTenant !== tenantId) {
    throw new Error('Modificatorul nu apartine acestui restaurant.');
  }
  const { error } = await admin
    .from('restaurant_menu_modifiers')
    .update({ name: parsed.name, price_delta_ron: parsed.price_delta_ron })
    .eq('id', parsed.id);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/menu');
}

export async function deleteModifierAction(formData: FormData) {
  const { tenantId } = await requireTenant();
  const parsed = modifierDeleteSchema.parse({ id: formData.get('id') });
  const admin = createAdminClient();
  const { data: mod, error: modErr } = await admin
    .from('restaurant_menu_modifiers')
    .select('id, restaurant_menu_items!inner(tenant_id)')
    .eq('id', parsed.id)
    .maybeSingle();
  if (modErr) throw new Error(modErr.message);
  const ownerTenant = (mod as unknown as { restaurant_menu_items?: { tenant_id?: string } } | null)
    ?.restaurant_menu_items?.tenant_id;
  if (!mod || ownerTenant !== tenantId) {
    throw new Error('Modificatorul nu apartine acestui restaurant.');
  }
  const { error } = await admin.from('restaurant_menu_modifiers').delete().eq('id', parsed.id);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/menu');
}

// ============================================================
// CSV BULK IMPORT
// ============================================================

export async function bulkImportItemsAction(input: {
  rows: Array<{ name: string; description?: string; price: number; category: string }>;
}): Promise<{ created: number; categoriesCreated: number }> {
  const { tenantId } = await requireTenant();
  const parsed = csvImportSchema.parse(input);
  const admin = createAdminClient();

  const { data: cats, error: catErr } = await admin
    .from('restaurant_menu_categories')
    .select('id, name, sort_order')
    .eq('tenant_id', tenantId);
  if (catErr) throw new Error(catErr.message);

  const byName = new Map<string, string>();
  let maxOrder = -1;
  for (const c of cats ?? []) {
    byName.set(c.name.toLowerCase(), c.id);
    if (c.sort_order > maxOrder) maxOrder = c.sort_order;
  }

  let categoriesCreated = 0;
  for (const row of parsed.rows) {
    const key = row.category.toLowerCase();
    if (!byName.has(key)) {
      maxOrder += 1;
      const { data: created, error } = await admin
        .from('restaurant_menu_categories')
        .insert({ tenant_id: tenantId, name: row.category, sort_order: maxOrder })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      byName.set(key, created.id);
      categoriesCreated += 1;
    }
  }

  const inserts = parsed.rows.map((row) => ({
    tenant_id: tenantId,
    category_id: byName.get(row.category.toLowerCase())!,
    name: row.name,
    description: row.description || null,
    price_ron: row.price,
    is_available: true,
    tags: [] as string[],
  }));

  const { error: insErr, count } = await admin
    .from('restaurant_menu_items')
    .insert(inserts, { count: 'exact' });
  if (insErr) throw new Error(insErr.message);

  revalidatePath('/dashboard/menu');
  return { created: count ?? inserts.length, categoriesCreated };
}
