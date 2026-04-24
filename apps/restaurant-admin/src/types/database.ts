// TODO(RSHIR-5): Replace with generated types from `packages/supabase-types`.
// This file exists so the RSHIR-7 menu module typechecks before the generated
// types package lands. The shapes mirror the spec (section 6) and Sprint 1's
// migrations should produce a superset of these columns.

export type Uuid = string;

export interface MenuCategoryRow {
  id: Uuid;
  tenant_id: Uuid;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MenuItemRow {
  id: Uuid;
  tenant_id: Uuid;
  category_id: Uuid | null;
  name: string;
  description: string | null;
  price_ron: number;
  image_url: string | null;
  tags: string[];
  is_available: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MenuModifierRow {
  id: Uuid;
  tenant_id: Uuid;
  item_id: Uuid;
  name: string;
  price_delta_ron: number;
  sort_order: number;
  created_at: string;
}

export interface MenuEventRow {
  id: number;
  tenant_id: Uuid;
  item_id: Uuid;
  is_available: boolean;
  at: string;
}

export interface TenantMemberRow {
  tenant_id: Uuid;
  user_id: Uuid;
  role: string;
}

export type MenuItemWithRelations = MenuItemRow & {
  category: Pick<MenuCategoryRow, 'id' | 'name'> | null;
  modifiers: MenuModifierRow[];
};
