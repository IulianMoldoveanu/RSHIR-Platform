'use client';

import { useMemo, useState, useTransition, type FormEvent } from 'react';
import {
  Button,
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@hir/ui';
import { ChefHat, Layers, Plus } from 'lucide-react';
import { TrashIcon } from './icons';
import {
  createModifierAction,
  createModifierGroupAction,
  deleteModifierAction,
  deleteModifierGroupAction,
  updateModifierAction,
  updateModifierGroupAction,
} from './actions';
import type { MenuItem, MenuModifier, MenuModifierGroup } from './page';

// Modifier groups + flat legacy modifiers for one menu item.
// Groups (e.g. "Mărime" required-pick-1) hold options with structured
// constraints; ungrouped modifiers fall back to the legacy "Extra
// opțiuni" optional list shown alongside.

export function ModifiersPanel({
  items,
  modifiers,
  modifierGroups,
}: {
  items: MenuItem[];
  modifiers: MenuModifier[];
  modifierGroups: MenuModifierGroup[];
}) {
  const [itemId, setItemId] = useState<string>(items[0]?.id ?? '');
  const [pending, start] = useTransition();

  const itemGroups = useMemo(
    () => modifierGroups.filter((g) => g.item_id === itemId).sort((a, b) => a.sort_order - b.sort_order),
    [modifierGroups, itemId],
  );
  const itemModifiers = useMemo(
    () => modifiers.filter((m) => m.item_id === itemId),
    [modifiers, itemId],
  );
  const ungroupedModifiers = useMemo(
    () => itemModifiers.filter((m) => !m.group_id),
    [itemModifiers],
  );
  const modifiersByGroup = useMemo(() => {
    const map = new Map<string, MenuModifier[]>();
    for (const m of itemModifiers) {
      if (!m.group_id) continue;
      const arr = map.get(m.group_id) ?? [];
      arr.push(m);
      map.set(m.group_id, arr);
    }
    return map;
  }, [itemModifiers]);

  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">Adauga mai intai un produs.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={itemId} onValueChange={setItemId}>
          <SelectTrigger className="w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((it) => (
              <SelectItem key={it.id} value={it.id}>
                {it.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <NewGroupForm itemId={itemId} pending={pending} start={start} />

      <div className="flex flex-col gap-3">
        {itemGroups.length === 0 ? (
          <EmptyState
            className="border-zinc-200"
            icon={<Layers className="h-10 w-10" />}
            title="Niciun grup de opțiuni configurat."
            description="Grupurile permit alegeri obligatorii (ex. Mărime: Mediu / Mare / Familie) sau opționale cu limite (ex. Toppinguri: max 5)."
          />
        ) : (
          itemGroups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              options={modifiersByGroup.get(group.id) ?? []}
              pending={pending}
              start={start}
            />
          ))
        )}
      </div>

      <UngroupedModifiers
        itemId={itemId}
        modifiers={ungroupedModifiers}
        pending={pending}
        start={start}
      />
    </div>
  );
}

function NewGroupForm({
  itemId,
  pending,
  start,
}: {
  itemId: string;
  pending: boolean;
  start: (cb: () => void) => void;
}) {
  const [name, setName] = useState('');
  const [isRequired, setIsRequired] = useState(true);
  const [selectMin, setSelectMin] = useState('1');
  const [selectMax, setSelectMax] = useState('1');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!itemId || !name.trim()) return;
    const fd = new FormData();
    fd.set('item_id', itemId);
    fd.set('name', name);
    fd.set('is_required', isRequired ? 'on' : 'off');
    fd.set('select_min', selectMin);
    fd.set('select_max', selectMax);
    start(async () => {
      try {
        await createModifierGroupAction(fd);
        toast.success('Grup adăugat');
        setName('');
        setIsRequired(true);
        setSelectMin('1');
        setSelectMax('1');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Eroare necunoscută');
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-wrap items-end gap-2 rounded-md border border-zinc-200 bg-white p-3"
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">Nume grup</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex: Mărime"
          className="w-56"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">Obligatoriu</label>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm">
          <input
            type="checkbox"
            checked={isRequired}
            onChange={(e) => setIsRequired(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-zinc-700">{isRequired ? 'Da' : 'Nu'}</span>
        </label>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">Min. selecții</label>
        <Input
          type="number"
          min={0}
          max={20}
          value={selectMin}
          onChange={(e) => setSelectMin(e.target.value)}
          className="w-20"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">Max. (gol = nelimitat)</label>
        <Input
          type="number"
          min={1}
          max={20}
          value={selectMax}
          onChange={(e) => setSelectMax(e.target.value)}
          className="w-24"
          placeholder="—"
        />
      </div>
      <Button type="submit" disabled={pending || !itemId || !name.trim()}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        Adaugă grup
      </Button>
    </form>
  );
}

function GroupCard({
  group,
  options,
  pending,
  start,
}: {
  group: MenuModifierGroup;
  options: MenuModifier[];
  pending: boolean;
  start: (cb: () => void) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [isRequired, setIsRequired] = useState(group.is_required);
  const [selectMin, setSelectMin] = useState(String(group.select_min));
  const [selectMax, setSelectMax] = useState(group.select_max === null ? '' : String(group.select_max));

  function onSave() {
    const fd = new FormData();
    fd.set('id', group.id);
    fd.set('name', name);
    fd.set('is_required', isRequired ? 'on' : 'off');
    fd.set('select_min', selectMin);
    fd.set('select_max', selectMax);
    start(async () => {
      try {
        await updateModifierGroupAction(fd);
        toast.success('Grup actualizat');
        setEditing(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Eroare necunoscută');
      }
    });
  }

  function onDelete() {
    if (!confirm('Ștergi grupul și toate opțiunile lui?')) return;
    const fd = new FormData();
    fd.set('id', group.id);
    start(async () => {
      try {
        await deleteModifierGroupAction(fd);
        toast.success('Grup șters');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Eroare necunoscută');
      }
    });
  }

  const constraintLabel = group.is_required
    ? group.select_max === 1 && group.select_min === 1
      ? 'Obligatoriu · Alege 1'
      : group.select_max === null
        ? `Obligatoriu · Alege min. ${group.select_min}`
        : `Obligatoriu · Alege ${group.select_min}–${group.select_max}`
    : group.select_max === 1
      ? 'Opțional · Alege 1'
      : group.select_max === null
        ? 'Opțional'
        : `Opțional · Până la ${group.select_max}`;

  return (
    <section className="rounded-md border border-zinc-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 p-3">
        {editing ? (
          <div className="flex flex-wrap items-end gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="w-48" />
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm">
              <input
                type="checkbox"
                checked={isRequired}
                onChange={(e) => setIsRequired(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-zinc-700">Obligatoriu</span>
            </label>
            <Input
              type="number"
              min={0}
              max={20}
              value={selectMin}
              onChange={(e) => setSelectMin(e.target.value)}
              className="w-20"
              placeholder="min"
            />
            <Input
              type="number"
              min={1}
              max={20}
              value={selectMax}
              onChange={(e) => setSelectMax(e.target.value)}
              className="w-24"
              placeholder="max"
            />
            <Button size="sm" onClick={onSave} disabled={pending || !name.trim()}>
              Salvează
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
              Anulează
            </Button>
          </div>
        ) : (
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">{group.name}</h3>
            <p className="text-xs text-zinc-500">{constraintLabel}</p>
          </div>
        )}
        {!editing && (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={pending}>
              Editează
            </Button>
            <Button size="icon" variant="ghost" onClick={onDelete} disabled={pending}>
              <TrashIcon className="h-4 w-4" />
            </Button>
          </div>
        )}
      </header>

      <div className="px-3 py-2">
        <NewOptionForm itemId={group.item_id} groupId={group.id} pending={pending} start={start} />
        {options.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-500">Niciun opțiune încă. Adaugă cel puțin una.</p>
        ) : (
          <ul className="mt-2">
            {options
              .slice()
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
              .map((m) => (
                <ModifierRow key={m.id} modifier={m} pending={pending} start={start} />
              ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function NewOptionForm({
  itemId,
  groupId,
  pending,
  start,
}: {
  itemId: string;
  groupId: string;
  pending: boolean;
  start: (cb: () => void) => void;
}) {
  const [name, setName] = useState('');
  const [delta, setDelta] = useState('0');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const fd = new FormData();
    fd.set('item_id', itemId);
    fd.set('name', name);
    fd.set('price_delta_ron', delta);
    fd.set('group_id', groupId);
    start(async () => {
      try {
        await createModifierAction(fd);
        toast.success('Opțiune adăugată');
        setName('');
        setDelta('0');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Eroare necunoscută');
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">Opțiune</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex: Mediu (32cm)"
          className="w-56"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">Preț (+/- RON)</label>
        <Input
          type="number"
          step="0.01"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          className="w-32"
        />
      </div>
      <Button type="submit" size="sm" disabled={pending || !name.trim()}>
        Adaugă
      </Button>
    </form>
  );
}

function UngroupedModifiers({
  itemId,
  modifiers,
  pending,
  start,
}: {
  itemId: string;
  modifiers: MenuModifier[];
  pending: boolean;
  start: (cb: () => void) => void;
}) {
  const [name, setName] = useState('');
  const [delta, setDelta] = useState('0');

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!itemId || !name.trim()) return;
    const fd = new FormData();
    fd.set('item_id', itemId);
    fd.set('name', name);
    fd.set('price_delta_ron', delta);
    start(async () => {
      try {
        await createModifierAction(fd);
        toast.success('Modificator adăugat');
        setName('');
        setDelta('0');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Eroare necunoscută');
      }
    });
  }

  return (
    <section className="rounded-md border border-zinc-200 bg-white">
      <header className="flex items-center justify-between border-b border-zinc-100 p-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Extra opțiuni (legacy)</h3>
          <p className="text-xs text-zinc-500">
            Modificatori liberi, fără grup. Ex. „Fără ceapă”, „Extra brânză”.
          </p>
        </div>
      </header>

      <form onSubmit={onCreate} className="flex flex-wrap items-end gap-2 p-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex: Fără ceapă"
          className="w-56"
        />
        <Input
          type="number"
          step="0.01"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          className="w-32"
        />
        <Button type="submit" size="sm" disabled={pending || !itemId || !name.trim()}>
          Adaugă
        </Button>
      </form>

      <div>
        {modifiers.length === 0 ? (
          <EmptyState
            className="border-0 bg-transparent"
            icon={<ChefHat className="h-10 w-10" />}
            title="Niciun modificator liber."
            description="Folosește grupurile de mai sus pentru opțiuni cu reguli (ex. Mărime). Aici intră modificatorii fără constrângeri."
          />
        ) : (
          <ul>
            {modifiers.map((m) => (
              <ModifierRow key={m.id} modifier={m} pending={pending} start={start} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ModifierRow({
  modifier,
  pending,
  start,
}: {
  modifier: MenuModifier;
  pending: boolean;
  start: (cb: () => void) => void;
}) {
  const [name, setName] = useState(modifier.name);
  const [delta, setDelta] = useState(String(modifier.price_delta_ron));
  const dirty = name !== modifier.name || Number(delta) !== modifier.price_delta_ron;

  function onUpdate() {
    const fd = new FormData();
    fd.set('id', modifier.id);
    fd.set('name', name);
    fd.set('price_delta_ron', delta);
    start(async () => {
      try {
        await updateModifierAction(fd);
        toast.success('Salvat');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Eroare necunoscută');
      }
    });
  }

  function onDelete() {
    if (!confirm('Ștergi această opțiune?')) return;
    const fd = new FormData();
    fd.set('id', modifier.id);
    start(async () => {
      try {
        await deleteModifierAction(fd);
        toast.success('Șters');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Eroare necunoscută');
      }
    });
  }

  return (
    <li className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2 last:border-b-0">
      <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
      <Input
        type="number"
        step="0.01"
        value={delta}
        onChange={(e) => setDelta(e.target.value)}
        className="w-32"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={pending || !dirty || !name.trim()}
        onClick={onUpdate}
      >
        Salvează
      </Button>
      <Button size="icon" variant="ghost" onClick={onDelete} disabled={pending}>
        <TrashIcon className="h-4 w-4" />
      </Button>
    </li>
  );
}
