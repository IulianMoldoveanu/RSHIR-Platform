'use client';

import { useMemo, useState, useTransition, type FormEvent } from 'react';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@hir/ui';
import { TrashIcon } from './icons';
import {
  createModifierAction,
  deleteModifierAction,
  updateModifierAction,
} from './actions';
import type { MenuItem, MenuModifier } from './page';

export function ModifiersPanel({
  items,
  modifiers,
}: {
  items: MenuItem[];
  modifiers: MenuModifier[];
}) {
  const [itemId, setItemId] = useState<string>(items[0]?.id ?? '');
  const [name, setName] = useState('');
  const [delta, setDelta] = useState('0');
  const [pending, start] = useTransition();

  const itemModifiers = useMemo(
    () => modifiers.filter((m) => m.item_id === itemId),
    [modifiers, itemId],
  );

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
        toast.success('Modificator adaugat');
        setName('');
        setDelta('0');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Eroare necunoscuta');
      }
    });
  }

  function onUpdate(m: MenuModifier, nextName: string, nextDelta: string) {
    const fd = new FormData();
    fd.set('id', m.id);
    fd.set('name', nextName);
    fd.set('price_delta_ron', nextDelta);
    start(async () => {
      try {
        await updateModifierAction(fd);
        toast.success('Modificator actualizat');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Eroare necunoscuta');
      }
    });
  }

  function onDelete(id: string) {
    if (!confirm('Stergi acest modificator?')) return;
    const fd = new FormData();
    fd.set('id', id);
    start(async () => {
      try {
        await deleteModifierAction(fd);
        toast.success('Modificator sters');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Eroare necunoscuta');
      }
    });
  }

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

      <form onSubmit={onCreate} className="flex flex-wrap items-end gap-2 rounded-md border border-zinc-200 bg-white p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">Nume modificator</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: extra cascaval"
            className="w-56"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">Pret (+/- RON)</label>
          <Input
            type="number"
            step="0.01"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            className="w-32"
          />
        </div>
        <Button type="submit" disabled={pending || !name.trim() || !itemId}>
          Adauga
        </Button>
      </form>

      <div className="rounded-md border border-zinc-200 bg-white">
        {itemModifiers.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">Niciun modificator pentru acest produs.</p>
        ) : (
          <ul>
            {itemModifiers.map((m) => (
              <ModifierRow key={m.id} modifier={m} pending={pending} onUpdate={onUpdate} onDelete={onDelete} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ModifierRow({
  modifier,
  pending,
  onUpdate,
  onDelete,
}: {
  modifier: MenuModifier;
  pending: boolean;
  onUpdate: (m: MenuModifier, name: string, delta: string) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(modifier.name);
  const [delta, setDelta] = useState(String(modifier.price_delta_ron));
  const dirty = name !== modifier.name || Number(delta) !== modifier.price_delta_ron;

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
        onClick={() => onUpdate(modifier, name, delta)}
      >
        Salveaza
      </Button>
      <Button size="icon" variant="ghost" onClick={() => onDelete(modifier.id)} disabled={pending}>
        <TrashIcon className="h-4 w-4" />
      </Button>
    </li>
  );
}
