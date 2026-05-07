'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@hir/ui';
import type { MenuCategory, MenuItem, MenuModifier, MenuModifierGroup } from './page';
import type { MenuAgentProposalRow } from '@/lib/ai/agents/menu-agent';
import { CategoriesPanel } from './categories-panel';
import { ItemsPanel } from './items-panel';
import { ModifiersPanel } from './modifiers-panel';
import { MenuAgentProposalsPanel } from './menu-agent-proposals-panel';

export function MenuTabs({
  tenantId,
  categories,
  items,
  modifiers,
  modifierGroups,
  proposals,
}: {
  tenantId: string;
  categories: MenuCategory[];
  items: MenuItem[];
  modifiers: MenuModifier[];
  modifierGroups: MenuModifierGroup[];
  proposals: MenuAgentProposalRow[];
}) {
  const draftCount = proposals.filter((p) => p.status === 'DRAFT').length;
  return (
    <Tabs defaultValue="items" className="w-full">
      <TabsList>
        <TabsTrigger value="items">Produse ({items.length})</TabsTrigger>
        <TabsTrigger value="categories">Categorii ({categories.length})</TabsTrigger>
        <TabsTrigger value="modifiers">Opțiuni ({modifierGroups.length + modifiers.length})</TabsTrigger>
        <TabsTrigger value="hepy">
          Sugestii Hepy{draftCount > 0 ? ` (${draftCount})` : ''}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="items">
        <ItemsPanel items={items} categories={categories} />
      </TabsContent>
      <TabsContent value="categories">
        <CategoriesPanel categories={categories} />
      </TabsContent>
      <TabsContent value="modifiers">
        <ModifiersPanel items={items} modifiers={modifiers} modifierGroups={modifierGroups} />
      </TabsContent>
      <TabsContent value="hepy">
        <MenuAgentProposalsPanel tenantId={tenantId} proposals={proposals} />
      </TabsContent>
    </Tabs>
  );
}
