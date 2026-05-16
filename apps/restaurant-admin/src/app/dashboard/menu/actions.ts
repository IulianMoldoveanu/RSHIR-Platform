'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import type { Database } from '@hir/supabase-types/database';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type MenuItemUpdate = Database['public']['Tables']['restaurant_menu_items']['Update'];
import { assertTenantMember, getActiveTenant } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';
import { dispatchMenuEvent } from '@/lib/integration-bus';
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
  itemReorderSchema,
  itemSoldOutSchema,
  itemUpdateSchema,
  modifierCreateSchema,
  modifierDeleteSchema,
  modifierUpdateSchema,
  modifierGroupCreateSchema,
  modifierGroupDeleteSchema,
  modifierGroupUpdateSchema,
} from './schemas';

const MENU_BUCKET = 'menu-images';
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

async function requireTenant(): Promise<{ userId: string; tenantId: string }> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated.');
  const { tenant } = await getActiveTenant();
  await assertTenantMember(user.id, tenant.id);
  return { userId: user.id, tenantId: tenant.id };
}

/**
 * Map a Supabase / PostgREST error to a Romanian, user-safe message.
 *
 * Raw `error.message` from PostgREST leaks DB internals (constraint names,
 * RLS policy text, column types) into client-side toasts. This wrapper
 * logs the original for server-side debugging and returns a generic
 * message keyed off the Postgres SQLSTATE code where available.
 */
function friendlyDbError(
  error: { code?: string | null; message: string; details?: string | null },
  context: string,
): Error {
  // Server-side log preserves the original for ops/debug.
  console.error(`[menu/actions] ${context}`, {
    code: error.code,
    message: error.message,
    details: error.details,
  });
  const code = error.code ?? '';
  if (code === '23505') return new Error('Există deja o intrare cu aceste date.');
  if (code === '23503') return new Error('Operațiune blocată: există referințe legate.');
  if (code === '23514') return new Error('Datele introduse nu trec validarea.');
  if (code === '42501' || code.startsWith('PGRST')) {
    return new Error('Nu aveți permisiunea pentru această operațiune.');
  }
  return new Error(`Eroare la ${context}. Reîncercați.`);
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
  if (error) {
    console.error('[menu/actions] uploadImage', { message: error.message });
    throw new Error('Încărcarea imaginii a eșuat. Reîncercați.');
  }
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
  if (error) throw friendlyDbError(error, 'adăugarea categoriei');
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
  if (error) throw friendlyDbError(error, 'actualizarea categoriei');
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
  if (error) throw friendlyDbError(error, 'schimbarea stării categoriei');
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
  if (error) throw friendlyDbError(error, 'dezactivarea categoriei');
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
    if (error) throw friendlyDbError(error, 'reordonarea categoriilor');
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
    prep_minutes: formData.get('prep_minutes') ?? '',
    serving_size_grams: formData.get('serving_size_grams') ?? '',
    serving_size_label: formData.get('serving_size_label') ?? '',
  });

  const admin = createAdminClient();

  // Verify category belongs to this tenant.
  const { data: cat, error: catErr } = await admin
    .from('restaurant_menu_categories')
    .select('id')
    .eq('id', parsed.category_id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (catErr) throw friendlyDbError(catErr, 'verificarea categoriei');
  if (!cat) throw new Error('Categorie inexistenta.');

  const itemId = randomUUID();
  let imageUrl: string | null = null;
  const file = formData.get('image');
  if (file instanceof File && file.size > 0) {
    imageUrl = await uploadImage(tenantId, itemId, file);
  }

  // Append new items to the end of their category — same semantics as the
  // category list. Default 0 collides for every legacy row, so a freshly-
  // computed nextOrder gives drag-to-reorder a meaningful starting point.
  const { data: maxRow } = await admin
    .from('restaurant_menu_items')
    .select('sort_order')
    .eq('tenant_id', tenantId)
    .eq('category_id', parsed.category_id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

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
    sort_order: nextOrder,
    prep_minutes: parsed.prep_minutes,
    serving_size_grams: parsed.serving_size_grams,
    serving_size_label: parsed.serving_size_label,
  });
  if (error) throw friendlyDbError(error, 'adăugarea produsului');
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
    prep_minutes: formData.get('prep_minutes') ?? '',
    serving_size_grams: formData.get('serving_size_grams') ?? '',
    serving_size_label: formData.get('serving_size_label') ?? '',
  });

  const admin = createAdminClient();

  const { data: existing, error: existErr } = await admin
    .from('restaurant_menu_items')
    .select('id, is_available')
    .eq('id', parsed.id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (existErr) throw friendlyDbError(existErr, 'încărcarea produsului');
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
    prep_minutes: parsed.prep_minutes,
    serving_size_grams: parsed.serving_size_grams,
    serving_size_label: parsed.serving_size_label,
  };
  if (imageUrl !== undefined) update.image_url = imageUrl;

  const { error } = await admin
    .from('restaurant_menu_items')
    .update(update)
    .eq('id', parsed.id)
    .eq('tenant_id', tenantId);
  if (error) throw friendlyDbError(error, 'actualizarea produsului');

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

export async function reorderItemsAction(input: {
  category_id: string;
  ids: string[];
}): Promise<void> {
  const { tenantId } = await requireTenant();
  const parsed = itemReorderSchema.parse(input);
  const admin = createAdminClient();

  // Verify the category belongs to this tenant before mutating items.
  const { data: cat, error: catErr } = await admin
    .from('restaurant_menu_categories')
    .select('id')
    .eq('id', parsed.category_id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (catErr) throw friendlyDbError(catErr, 'verificarea categoriei');
  if (!cat) throw new Error('Categorie inexistenta.');

  // Update sort_order for each item in the supplied order. Tenant + category
  // scoping in the WHERE prevents reordering rows from a different tenant or
  // a different category by id-spoofing.
  for (let i = 0; i < parsed.ids.length; i++) {
    const { error } = await admin
      .from('restaurant_menu_items')
      .update({ sort_order: i })
      .eq('id', parsed.ids[i])
      .eq('tenant_id', tenantId)
      .eq('category_id', parsed.category_id);
    if (error) throw friendlyDbError(error, 'reordonarea produselor');
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
  if (error) throw friendlyDbError(error, 'ștergerea produsului');
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
  if (error) throw friendlyDbError(error, 'schimbarea disponibilității');

  await admin.from('menu_events').insert({
    tenant_id: tenantId,
    item_id: parsed.id,
    is_available: parsed.is_available,
  });

  // RSHIR-51: integration bus — POS adapters that care about availability
  // get a separate event; storefront keeps using menu_events directly.
  await dispatchMenuEvent(tenantId, 'availability_changed', {
    itemId: parsed.id,
    name: '',
    description: null,
    priceRon: 0,
    isAvailable: parsed.is_available,
    categoryId: '',
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
  if (error) throw friendlyDbError(error, 'schimbarea disponibilității în bloc');

  const events = parsed.ids.map((id) => ({
    tenant_id: tenantId,
    item_id: id,
    is_available: parsed.is_available,
  }));
  await admin.from('menu_events').insert(events);
  revalidatePath('/dashboard/menu');
}

// ============================================================
// SOLD-OUT TODAY (RSHIR-49)
// ============================================================

const TZ = 'Europe/Bucharest';
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function parseHm(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mn = Number(m[2]);
  if (h < 0 || h > 24 || mn < 0 || mn >= 60) return null;
  return h * 60 + mn;
}

function tzPartsAt(date: Date): { y: number; m: number; d: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    weekday: weekdayMap[parts.weekday] ?? 0,
  };
}

/** Returns a UTC Date matching y/m/d hh:mm (local minutes-of-day) in TZ. */
function dateFromLocal(y: number, m: number, d: number, hm: number): Date {
  const h = Math.floor(hm / 60);
  const mn = hm % 60;
  const guess = Date.UTC(y, m - 1, d, h, mn);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(guess)).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const guessAsTzUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMs = guessAsTzUtc - guess;
  return new Date(guess - offsetMs);
}

/**
 * "End of current business day" in Europe/Bucharest. If the tenant has
 * `opening_hours` configured for today with at least one parseable window,
 * returns the latest `close` time today. Otherwise falls back to local
 * midnight at the end of today (24:00). Mirrors restaurant-web/operations.ts.
 */
function endOfBusinessDay(settings: unknown, now: Date = new Date()): Date {
  const today = tzPartsAt(now);
  const hours = (settings as { opening_hours?: Record<string, Array<{ open: string; close: string }>> } | null)
    ?.opening_hours;
  const windows = hours?.[DAYS[today.weekday]];
  if (Array.isArray(windows) && windows.length > 0) {
    let latestClose = -1;
    for (const w of windows) {
      const close = parseHm(w.close);
      if (close !== null && close > latestClose) latestClose = close;
    }
    if (latestClose > 0) {
      return dateFromLocal(today.y, today.m, today.d, latestClose);
    }
  }
  // Fallback: local midnight at the start of tomorrow (i.e. end of today).
  return dateFromLocal(today.y, today.m, today.d, 24 * 60);
}

export async function setItemSoldOutTodayAction(input: { id: string }) {
  const { userId, tenantId } = await requireTenant();
  const parsed = itemSoldOutSchema.parse(input);
  const admin = createAdminClient();

  const { data: tenantRow, error: tErr } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .maybeSingle();
  if (tErr) throw friendlyDbError(tErr, 'încărcarea setărilor');

  const soldOutUntil = endOfBusinessDay(tenantRow?.settings ?? null);
  const { error } = await admin
    .from('restaurant_menu_items')
    .update({ sold_out_until: soldOutUntil.toISOString() })
    .eq('id', parsed.id)
    .eq('tenant_id', tenantId);
  if (error) throw friendlyDbError(error, 'marcarea ca epuizat');

  await admin.from('menu_events').insert({
    tenant_id: tenantId,
    item_id: parsed.id,
    is_available: false,
  });
  await logAudit({
    tenantId,
    actorUserId: userId,
    action: 'menu.sold_out_set',
    entityType: 'menu_item',
    entityId: parsed.id,
    metadata: { sold_out_until: soldOutUntil.toISOString() },
  });
  revalidatePath('/dashboard/menu');
}

export async function clearItemSoldOutAction(input: { id: string }) {
  const { userId, tenantId } = await requireTenant();
  const parsed = itemSoldOutSchema.parse(input);
  const admin = createAdminClient();

  const { data: existing, error: existErr } = await admin
    .from('restaurant_menu_items')
    .select('id, is_available')
    .eq('id', parsed.id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (existErr) throw friendlyDbError(existErr, 'încărcarea produsului');
  if (!existing) throw new Error('Produsul nu exista.');

  const { error } = await admin
    .from('restaurant_menu_items')
    .update({ sold_out_until: null })
    .eq('id', parsed.id)
    .eq('tenant_id', tenantId);
  if (error) throw friendlyDbError(error, 'eliminarea marcajului epuizat');

  // Reflect the item's underlying availability on the live channel — if
  // is_available is still false, we shouldn't tell clients it's available.
  await admin.from('menu_events').insert({
    tenant_id: tenantId,
    item_id: parsed.id,
    is_available: existing.is_available,
  });
  await logAudit({
    tenantId,
    actorUserId: userId,
    action: 'menu.sold_out_cleared',
    entityType: 'menu_item',
    entityId: parsed.id,
  });
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
  if (error) throw friendlyDbError(error, 'verificarea produsului');
  if (!data) throw new Error('Produsul nu exista in acest restaurant.');
}

export async function createModifierAction(formData: FormData) {
  const { tenantId } = await requireTenant();
  const parsed = modifierCreateSchema.parse({
    item_id: formData.get('item_id'),
    name: formData.get('name'),
    price_delta_ron: formData.get('price_delta_ron'),
    group_id: formData.get('group_id') ?? '',
  });
  await assertItemBelongsToTenant(parsed.item_id, tenantId);
  const admin = createAdminClient();
  // Normalize: empty string → null FK, real uuid → group assignment.
  const groupId = parsed.group_id && parsed.group_id !== '' ? parsed.group_id : null;
  const { error } = await admin.from('restaurant_menu_modifiers').insert({
    item_id: parsed.item_id,
    name: parsed.name,
    price_delta_ron: parsed.price_delta_ron,
    // Cast through unknown until supabase-types regenerates with the column
    // (migration 20260505_001 may have shipped post-typegen).
    ...(groupId ? { group_id: groupId } : {}),
  } as never);
  if (error) throw friendlyDbError(error, 'adăugarea opțiunii');
  revalidatePath('/dashboard/menu');
}

// ============================================================
// MODIFIER GROUPS (size variants, required choices)
// ============================================================

// supabase-js types don't yet know about restaurant_menu_modifier_groups
// (typegen was last run pre-migration 20260505_001). Cast through unknown
// to escape both the table-name typing and the row-shape inference for
// inserts/updates. PostgREST validates at runtime via the actual schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminAny = any;

export async function createModifierGroupAction(formData: FormData) {
  const { tenantId } = await requireTenant();
  const parsed = modifierGroupCreateSchema.parse({
    item_id: formData.get('item_id'),
    name: formData.get('name'),
    is_required: formData.get('is_required') ?? 'off',
    select_min: formData.get('select_min'),
    select_max: formData.get('select_max') ?? '',
    sort_order: formData.get('sort_order') ?? '0',
  });
  await assertItemBelongsToTenant(parsed.item_id, tenantId);
  const admin = createAdminClient() as unknown as AdminAny;
  const { error } = await admin.from('restaurant_menu_modifier_groups').insert({
    item_id: parsed.item_id,
    name: parsed.name,
    is_required: parsed.is_required,
    select_min: parsed.select_min,
    select_max: parsed.select_max,
    sort_order: parsed.sort_order ?? 0,
  });
  if (error) throw friendlyDbError(error, 'adăugarea grupului de opțiuni');
  revalidatePath('/dashboard/menu');
}

export async function updateModifierGroupAction(formData: FormData) {
  const { tenantId } = await requireTenant();
  const parsed = modifierGroupUpdateSchema.parse({
    id: formData.get('id'),
    name: formData.get('name'),
    is_required: formData.get('is_required') ?? 'off',
    select_min: formData.get('select_min'),
    select_max: formData.get('select_max') ?? '',
    sort_order: formData.get('sort_order') ?? '0',
  });
  const admin = createAdminClient() as unknown as AdminAny;
  const { data: grp, error: grpErr } = await admin
    .from('restaurant_menu_modifier_groups')
    .select('id, restaurant_menu_items!inner(tenant_id)')
    .eq('id', parsed.id)
    .maybeSingle();
  if (grpErr) throw friendlyDbError(grpErr, 'verificarea grupului');
  if (!grp || grp.restaurant_menu_items?.tenant_id !== tenantId) {
    throw new Error('Grupul nu apartine acestui restaurant.');
  }
  const { error } = await admin
    .from('restaurant_menu_modifier_groups')
    .update({
      name: parsed.name,
      is_required: parsed.is_required,
      select_min: parsed.select_min,
      select_max: parsed.select_max,
      sort_order: parsed.sort_order ?? 0,
    })
    .eq('id', parsed.id);
  if (error) throw friendlyDbError(error, 'actualizarea grupului de opțiuni');
  revalidatePath('/dashboard/menu');
}

export async function deleteModifierGroupAction(formData: FormData) {
  const { tenantId } = await requireTenant();
  const parsed = modifierGroupDeleteSchema.parse({ id: formData.get('id') });
  const admin = createAdminClient() as unknown as AdminAny;
  const { data: grp, error: grpErr } = await admin
    .from('restaurant_menu_modifier_groups')
    .select('id, restaurant_menu_items!inner(tenant_id)')
    .eq('id', parsed.id)
    .maybeSingle();
  if (grpErr) throw friendlyDbError(grpErr, 'verificarea grupului');
  if (!grp || grp.restaurant_menu_items?.tenant_id !== tenantId) {
    throw new Error('Grupul nu apartine acestui restaurant.');
  }
  // ON DELETE CASCADE on the FK drops options under this group.
  const { error } = await admin
    .from('restaurant_menu_modifier_groups')
    .delete()
    .eq('id', parsed.id);
  if (error) throw friendlyDbError(error, 'ștergerea grupului de opțiuni');
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
  if (modErr) throw friendlyDbError(modErr, 'verificarea opțiunii');
  const ownerTenant = (mod as unknown as { restaurant_menu_items?: { tenant_id?: string } } | null)
    ?.restaurant_menu_items?.tenant_id;
  if (!mod || ownerTenant !== tenantId) {
    throw new Error('Modificatorul nu apartine acestui restaurant.');
  }
  const { error } = await admin
    .from('restaurant_menu_modifiers')
    .update({ name: parsed.name, price_delta_ron: parsed.price_delta_ron })
    .eq('id', parsed.id);
  if (error) throw friendlyDbError(error, 'actualizarea opțiunii');
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
  if (modErr) throw friendlyDbError(modErr, 'verificarea opțiunii');
  const ownerTenant = (mod as unknown as { restaurant_menu_items?: { tenant_id?: string } } | null)
    ?.restaurant_menu_items?.tenant_id;
  if (!mod || ownerTenant !== tenantId) {
    throw new Error('Modificatorul nu apartine acestui restaurant.');
  }
  const { error } = await admin.from('restaurant_menu_modifiers').delete().eq('id', parsed.id);
  if (error) throw friendlyDbError(error, 'ștergerea opțiunii');
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
  if (catErr) throw friendlyDbError(catErr, 'încărcarea categoriilor');

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
      if (error) throw friendlyDbError(error, 'crearea categoriei din import');
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
  if (insErr) throw friendlyDbError(insErr, 'importul produselor');

  revalidatePath('/dashboard/menu');
  return { created: count ?? inserts.length, categoriesCreated };
}
