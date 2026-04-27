'use client';

import { useState, useTransition, type FormEvent } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@hir/ui';
import { createItemAction, updateItemAction } from './actions';
import type { MenuCategory, MenuItem } from './page';

type Props = {
  mode: 'create' | 'edit';
  item?: MenuItem;
  categories: MenuCategory[];
  onClose: () => void;
};

export function ItemFormDialog({ mode, item, categories, onClose }: Props) {
  const [pending, start] = useTransition();
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [priceRon, setPriceRon] = useState(item ? String(item.price_ron) : '');
  const [categoryId, setCategoryId] = useState(item?.category_id ?? categories[0]?.id ?? '');
  const [tags, setTags] = useState(item?.tags?.join(', ') ?? '');
  const [isAvailable, setIsAvailable] = useState(item?.is_available ?? true);
  const [imageFile, setImageFile] = useState<File | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!categoryId) {
      toast.error('Selectează o categorie.');
      return;
    }
    const fd = new FormData();
    fd.set('name', name);
    fd.set('description', description);
    fd.set('price_ron', priceRon);
    fd.set('category_id', categoryId);
    fd.set('tags', tags);
    fd.set('is_available', isAvailable ? 'on' : 'off');
    if (imageFile) fd.set('image', imageFile);
    if (mode === 'edit' && item) fd.set('id', item.id);

    start(async () => {
      try {
        if (mode === 'create') await createItemAction(fd);
        else await updateItemAction(fd);
        toast.success(mode === 'create' ? 'Produs adăugat' : 'Produs actualizat');
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Eroare necunoscută');
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Produs nou' : 'Editează produs'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nume</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Descriere</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="price_ron">Pret (RON)</Label>
              <Input
                id="price_ron"
                type="number"
                step="0.01"
                min="0"
                value={priceRon}
                onChange={(e) => setPriceRon(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category_id">Categorie</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="category_id">
                  <SelectValue placeholder="Alege categorie" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tags">Tag-uri (separate prin virgula)</Label>
            <Input
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="vegan, picant, popular"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="image">Imagine (max 5MB)</Label>
            <input
              id="image"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            {item?.image_url && !imageFile && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image_url} alt="" width={80} height={80} className="mt-1 h-20 w-20 rounded object-cover" />
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isAvailable}
              onChange={(e) => setIsAvailable(e.target.checked)}
            />
            Disponibil pentru comandă
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Anulează
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Se salvează...' : 'Salvează'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
