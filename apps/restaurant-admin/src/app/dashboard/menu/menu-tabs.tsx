'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@hir/ui';
import type { MenuCategory, MenuItem, MenuModifier } from './page';
import { CategoriesPanel } from './categories-panel';
import { ItemsPanel } from './items-panel';
import { ModifiersPanel } from './modifiers-panel';

export function MenuTabs({
  categories,
  items,
  modifiers,
}: {
  categories: MenuCategory[];
  items: MenuItem[];
  modifiers: MenuModifier[];
}) {
  return (
    <Tabs defaultValue="items" className="w-full">
      <TabsList>
        <TabsTrigger value="items">Produse ({items.length})</TabsTrigger>
        <TabsTrigger value="categories">Categorii ({categories.length})</TabsTrigger>
        <TabsTrigger value="modifiers">Modificatori ({modifiers.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="items">
        <ItemsPanel items={items} categories={categories} />
      </TabsContent>
      <TabsContent value="categories">
        <CategoriesPanel categories={categories} />
      </TabsContent>
      <TabsContent value="modifiers">
        <ModifiersPanel items={items} modifiers={modifiers} />
      </TabsContent>
    </Tabs>
  );
}
