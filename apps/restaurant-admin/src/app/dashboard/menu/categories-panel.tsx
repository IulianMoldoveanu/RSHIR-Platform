'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { Button, Input, toast } from '@hir/ui';
import { EyeIcon, EyeOffIcon, GripIcon, PencilIcon, TrashIcon } from './icons';
import {
  createCategoryAction,
  deleteCategoryAction,
  reorderCategoriesAction,
  toggleCategoryActiveAction,
  updateCategoryAction,
} from './actions';
import type { MenuCategory } from './page';

export function CategoriesPanel({ categories }: { categories: MenuCategory[] }) {
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [orderedIds, setOrderedIds] = useState<string[]>(categories.map((c) => c.id));
  const [pending, start] = useTransition();
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Re-sync if server data changes.
  if (
    orderedIds.length !== categories.length ||
    orderedIds.some((id, i) => categories[i] && categories[i].id !== id && !orderedIds.includes(categories[i].id))
  ) {
    // fall through; do nothing
  }

  const ordered = orderedIds
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is MenuCategory => Boolean(c));
  // Append any not-yet-tracked categories (newly added).
  for (const c of categories) {
    if (!ordered.find((x) => x.id === c.id)) ordered.push(c);
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const fd = new FormData();
    fd.set('name', name);
    start(async () => {
      try {
        await createCategoryAction(fd);
        toast.success('Categorie adaugata');
        setName('');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Eroare necunoscuta');
      }
    });
  }

  function onSaveEdit(id: string) {
    if (!editingName.trim()) return;
    const fd = new FormData();
    fd.set('id', id);
    fd.set('name', editingName);
    start(async () => {
      try {
        await updateCategoryAction(fd);
        toast.success('Categorie actualizata');
        setEditingId(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Eroare necunoscuta');
      }
    });
  }

  function onToggleActive(c: MenuCategory) {
    const fd = new FormData();
    fd.set('id', c.id);
    fd.set('is_active', String(!c.is_active));
    start(async () => {
      try {
        await toggleCategoryActiveAction(fd);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Eroare necunoscuta');
      }
    });
  }

  function onDelete(id: string) {
    if (!confirm('Stergi (dezactivezi) aceasta categorie?')) return;
    const fd = new FormData();
    fd.set('id', id);
    start(async () => {
      try {
        await deleteCategoryAction(fd);
        toast.success('Categorie dezactivata');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Eroare necunoscuta');
      }
    });
  }

  function onDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const ids = ordered.map((c) => c.id);
    const [moved] = ids.splice(dragIndex, 1);
    ids.splice(targetIndex, 0, moved);
    setOrderedIds(ids);
    setDragIndex(null);
    start(async () => {
      try {
        await reorderCategoriesAction(ids);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Eroare necunoscuta');
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onCreate} className="flex items-center gap-2">
        <Input
          placeholder="Nume categorie noua..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" disabled={pending || !name.trim()}>
          Adauga
        </Button>
      </form>

      <div className="rounded-md border border-zinc-200 bg-white">
        {ordered.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">Nicio categorie. Adauga prima ta categorie.</p>
        ) : (
          <ul>
            {ordered.map((c, idx) => (
              <li
                key={c.id}
                draggable
                onDragStart={() => setDragIndex(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(idx)}
                className={`flex items-center gap-2 border-b border-zinc-100 px-3 py-2 last:border-b-0 ${
                  dragIndex === idx ? 'opacity-60' : ''
                } ${c.is_active ? '' : 'bg-zinc-50 text-zinc-400'}`}
              >
                <GripIcon className="h-4 w-4 cursor-grab text-zinc-400" />
                {editingId === c.id ? (
                  <>
                    <Input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onSaveEdit(c.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="max-w-xs"
                    />
                    <Button size="sm" onClick={() => onSaveEdit(c.id)} disabled={pending}>
                      Salveaza
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Anuleaza
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm">{c.name}</span>
                    {!c.is_active && (
                      <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-600">inactiv</span>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onToggleActive(c)}
                      disabled={pending}
                      title={c.is_active ? 'Dezactiveaza' : 'Reactiveaza'}
                    >
                      {c.is_active ? <EyeIcon className="h-4 w-4" /> : <EyeOffIcon className="h-4 w-4" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(c.id);
                        setEditingName(c.name);
                      }}
                      disabled={pending}
                    >
                      <PencilIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onDelete(c.id)}
                      disabled={pending}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
