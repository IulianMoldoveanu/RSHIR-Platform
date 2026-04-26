'use client';

import { useMemo, useState, useTransition } from 'react';
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
import { BookOpen } from 'lucide-react';
import { PencilIcon, TrashIcon } from './icons';
import {
  bulkToggleAvailabilityAction,
  clearItemSoldOutAction,
  deleteItemAction,
  setItemSoldOutTodayAction,
  toggleItemAvailabilityAction,
} from './actions';
import { ItemFormDialog } from './item-form-dialog';
import { CsvImportDialog } from './csv-import-dialog';
import type { MenuCategory, MenuItem } from './page';

type FilterCategory = 'all' | string;

function isSoldOutNow(until: string | null): boolean {
  if (!until) return false;
  return new Date(until).getTime() > Date.now();
}

export function ItemsPanel({
  items,
  categories,
}: {
  items: MenuItem[];
  categories: MenuCategory[];
}) {
  const [filter, setFilter] = useState<FilterCategory>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pending, start] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filter !== 'all' && it.category_id !== filter) return false;
      if (q && !it.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, filter, search]);

  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAvailability(item: MenuItem) {
    start(async () => {
      try {
        await toggleItemAvailabilityAction({
          id: item.id,
          is_available: !item.is_available,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Eroare necunoscuta');
      }
    });
  }

  function toggleSoldOut(item: MenuItem) {
    const isSoldOut = isSoldOutNow(item.sold_out_until);
    start(async () => {
      try {
        if (isSoldOut) {
          await clearItemSoldOutAction({ id: item.id });
          toast.success('Disponibil din nou');
        } else {
          await setItemSoldOutTodayAction({ id: item.id });
          toast.success('Marcat epuizat azi');
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Eroare necunoscuta');
      }
    });
  }

  function bulkSet(value: boolean) {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    start(async () => {
      try {
        await bulkToggleAvailabilityAction({ ids, is_available: value });
        toast.success(`${ids.length} produse actualizate`);
        setSelected(new Set());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Eroare necunoscuta');
      }
    });
  }

  function onDelete(item: MenuItem) {
    if (!confirm(`Stergi "${item.name}"?`)) return;
    const fd = new FormData();
    fd.set('id', item.id);
    start(async () => {
      try {
        await deleteItemAction(fd);
        toast.success('Produs sters');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Eroare necunoscuta');
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Cauta..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filter} onValueChange={(v) => setFilter(v as FilterCategory)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate categoriile</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button variant="outline" onClick={() => setImporting(true)} disabled={categories.length === 0}>
          Import CSV
        </Button>
        <a
          href="/dashboard/menu/import"
          className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
        >
          Import AI
        </a>
        <Button onClick={() => setCreating(true)} disabled={categories.length === 0}>
          + Produs nou
        </Button>
      </div>

      {categories.length === 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Adauga mai intai o categorie din tab-ul "Categorii".
        </p>
      )}

      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
          <span>{selected.size} selectate</span>
          <Button size="sm" variant="outline" onClick={() => bulkSet(true)} disabled={pending}>
            Marcheaza disponibile
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulkSet(false)} disabled={pending}>
            Marcheaza indisponibile
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Anuleaza
          </Button>
        </div>
      )}

      <div className="rounded-md border border-zinc-200 bg-white">
        {filtered.length === 0 ? (
          <EmptyState
            className="border-0 bg-transparent"
            icon={<BookOpen className="h-10 w-10" />}
            title={search ? 'Niciun produs nu se potrivește căutării.' : 'Niciun produs încă.'}
            description={
              search
                ? 'Încearcă alt termen sau șterge filtrele.'
                : 'Adaugă primul produs din meniu sau importă rapid din CSV/imagine.'
            }
            action={
              !search && categories.length > 0 ? (
                <Button onClick={() => setCreating(true)}>+ Produs nou</Button>
              ) : undefined
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
              <tr>
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.size > 0 && selected.size === filtered.length}
                    onChange={(e) => {
                      setSelected(e.target.checked ? new Set(filtered.map((i) => i.id)) : new Set());
                    }}
                  />
                </th>
                <th className="px-3 py-2">Imagine</th>
                <th className="px-3 py-2">Nume</th>
                <th className="px-3 py-2">Categorie</th>
                <th className="px-3 py-2">Pret</th>
                <th className="px-3 py-2">Disponibil</th>
                <th className="px-3 py-2">Epuizat azi</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.id} className="border-b border-zinc-100 last:border-b-0">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(it.id)}
                      onChange={() => toggleSelected(it.id)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {it.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.image_url}
                        alt={it.name}
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-zinc-100" />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-zinc-900">{it.name}</div>
                    {it.tags.length > 0 && (
                      <div className="mt-0.5 flex gap-1">
                        {it.tags.map((t) => (
                          <span key={t} className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-zinc-600">
                    {categoriesById.get(it.category_id)?.name ?? '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{it.price_ron.toFixed(2)} RON</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleAvailability(it)}
                      disabled={pending}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        it.is_available ? 'bg-emerald-500' : 'bg-zinc-300'
                      } disabled:opacity-50`}
                      aria-label="Comuta disponibilitate"
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          it.is_available ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    {(() => {
                      const soldOut = isSoldOutNow(it.sold_out_until);
                      return (
                        <Button
                          size="sm"
                          variant={soldOut ? 'default' : 'outline'}
                          onClick={() => toggleSoldOut(it)}
                          disabled={pending}
                        >
                          {soldOut ? 'Disponibil din nou' : 'Epuizat azi'}
                        </Button>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(it)}>
                      <PencilIcon className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => onDelete(it)}>
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <ItemFormDialog
          mode="create"
          categories={categories}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <ItemFormDialog
          mode="edit"
          item={editing}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      )}
      {importing && (
        <CsvImportDialog onClose={() => setImporting(false)} />
      )}
    </div>
  );
}
