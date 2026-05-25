'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';

export type CreateSiblingInput = {
  rootTenantId: string;
  name: string;
  slug: string;
  cityId: string | null;
  cloneMenu: boolean;
  cloneBranding: boolean;
};

export type CreateSiblingResult =
  | {
      ok: true;
      newTenantId: string;
      newTenantName: string;
      newTenantSlug: string;
      clonedCategories: number;
      clonedItems: number;
      clonedModifiers: number;
      ownersAdded: number;
    }
  | { ok: false; error: string };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function createSiblingLocationAction(
  input: CreateSiblingInput,
): Promise<CreateSiblingResult> {
  // Platform-admin only.
  const supa = await createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthenticated.' };
  if (!isPlatformAdminEmail(user.email)) {
    return { ok: false, error: 'Doar administratorii platformei pot adăuga locații noi.' };
  }

  // Validate.
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  if (name.length < 2 || name.length > 200) {
    return { ok: false, error: 'Numele trebuie să aibă 2-200 caractere.' };
  }
  if (!SLUG_RE.test(slug)) {
    return {
      ok: false,
      error: 'Slug invalid (doar litere mici, cifre și liniuțe; ex: pizza-bun-brasov).',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // 1. Confirm the root tenant exists, is ACTIVE, and is itself a root.
  const { data: rootRow, error: rootErr } = await admin
    .from('tenants')
    .select('id, name, slug, status, parent_brand_id, settings, city_id')
    .eq('id', input.rootTenantId)
    .maybeSingle();
  if (rootErr || !rootRow) {
    return { ok: false, error: 'Tenant-ul root nu a fost găsit.' };
  }
  if (rootRow.status !== 'ACTIVE') {
    return { ok: false, error: 'Tenant-ul root nu este activ.' };
  }
  if (rootRow.parent_brand_id !== null) {
    return {
      ok: false,
      error:
        'Tenant-ul selectat este deja o locație frate (parent_brand_id != NULL). Selectează ROOT-ul.',
    };
  }

  // 2. Slug uniqueness (slug must be globally unique per existing schema).
  const { data: dup } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (dup) {
    return { ok: false, error: `Slug-ul "${slug}" este deja folosit.` };
  }

  // 3. Build settings: optionally inherit branding from root.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rootSettings = (rootRow.settings ?? {}) as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newSettings: Record<string, any> = input.cloneBranding
    ? { ...rootSettings }
    : {};
  // Always strip per-location-only keys we don't want to inherit blindly.
  // city is set explicitly via city_id; settings.city free-text stays per-tenant.
  if (input.cloneBranding && newSettings.city) delete newSettings.city;

  // 4. Insert the new tenant.
  const { data: newTenant, error: insErr } = await admin
    .from('tenants')
    .insert({
      name,
      slug,
      status: 'ACTIVE',
      city_id: input.cityId,
      parent_brand_id: rootRow.id,
      settings: newSettings,
    })
    .select('id, name, slug')
    .single();
  if (insErr || !newTenant) {
    return {
      ok: false,
      error: `Inserare tenant eșuată: ${insErr?.message ?? 'unknown'}`,
    };
  }

  // 5. Copy OWNER memberships from the root.
  const { data: rootMembers } = await admin
    .from('tenant_members')
    .select('user_id, role')
    .eq('tenant_id', rootRow.id)
    .eq('role', 'OWNER');

  let ownersAdded = 0;
  for (const m of (rootMembers ?? []) as Array<{ user_id: string; role: string }>) {
    const { error: memberErr } = await admin
      .from('tenant_members')
      .insert({ tenant_id: newTenant.id, user_id: m.user_id, role: 'OWNER' });
    if (!memberErr) ownersAdded += 1;
  }

  // 6. Optionally clone menu.
  let clonedCategories = 0;
  let clonedItems = 0;
  let clonedModifiers = 0;
  if (input.cloneMenu) {
    const r = await cloneMenu(admin, rootRow.id, newTenant.id);
    clonedCategories = r.categories;
    clonedItems = r.items;
    clonedModifiers = r.modifiers;
  }

  revalidatePath('/dashboard/admin/tenants');
  revalidatePath('/dashboard/admin/onboard/sibling');

  return {
    ok: true,
    newTenantId: newTenant.id,
    newTenantName: newTenant.name,
    newTenantSlug: newTenant.slug,
    clonedCategories,
    clonedItems,
    clonedModifiers,
    ownersAdded,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cloneMenu(admin: any, fromTenantId: string, toTenantId: string) {
  const { data: cats } = await admin
    .from('restaurant_menu_categories')
    .select('id, name, sort_order, is_active')
    .eq('tenant_id', fromTenantId);

  let catsInserted = 0;
  let itemsInserted = 0;
  let modsInserted = 0;
  const catIdMap = new Map<string, string>();

  for (const c of (cats ?? []) as Array<{
    id: string;
    name: string;
    sort_order: number;
    is_active: boolean;
  }>) {
    const { data: newCat } = await admin
      .from('restaurant_menu_categories')
      .insert({
        tenant_id: toTenantId,
        name: c.name,
        sort_order: c.sort_order,
        is_active: c.is_active,
      })
      .select('id')
      .single();
    if (!newCat) continue;
    catIdMap.set(c.id, newCat.id);
    catsInserted += 1;
  }

  const { data: items } = await admin
    .from('restaurant_menu_items')
    .select(
      'id, category_id, name, description, price_ron, image_url, is_available, sort_order, tags',
    )
    .eq('tenant_id', fromTenantId);

  const itemIdMap = new Map<string, string>();
  for (const it of (items ?? []) as Array<{
    id: string;
    category_id: string;
    name: string;
    description: string | null;
    price_ron: string | number;
    image_url: string | null;
    is_available: boolean;
    sort_order: number;
    tags: string[];
  }>) {
    const newCatId = catIdMap.get(it.category_id);
    if (!newCatId) continue;
    const { data: newItem } = await admin
      .from('restaurant_menu_items')
      .insert({
        tenant_id: toTenantId,
        category_id: newCatId,
        name: it.name,
        description: it.description,
        price_ron: it.price_ron,
        image_url: it.image_url,
        is_available: it.is_available,
        sort_order: it.sort_order,
        tags: it.tags,
      })
      .select('id')
      .single();
    if (!newItem) continue;
    itemIdMap.set(it.id, newItem.id);
    itemsInserted += 1;
  }

  const { data: mods } = await admin
    .from('restaurant_menu_modifiers')
    .select('item_id, name, price_delta_ron')
    .in('item_id', Array.from(itemIdMap.keys()));

  for (const m of (mods ?? []) as Array<{
    item_id: string;
    name: string;
    price_delta_ron: string | number;
  }>) {
    const newItemId = itemIdMap.get(m.item_id);
    if (!newItemId) continue;
    const { error: modErr } = await admin
      .from('restaurant_menu_modifiers')
      .insert({
        item_id: newItemId,
        name: m.name,
        price_delta_ron: m.price_delta_ron,
      });
    if (!modErr) modsInserted += 1;
  }

  return { categories: catsInserted, items: itemsInserted, modifiers: modsInserted };
}
