'use client';

import { useState, useTransition, type FormEvent } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@hir/ui';
import { bulkImportItemsAction } from './actions';

const PLACEHOLDER = `name,description,price,category
Pizza Margherita,sos rosii + mozzarella,32.50,Pizza
Tiramisu,desert clasic italian,18,Desert`;

type Row = { name: string; description: string; price: number; category: string };

function parseCsv(text: string): { rows: Row[]; errors: string[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { rows: [], errors: ['Niciun rând.'] };

  // Skip header if it looks like one.
  const first = lines[0].toLowerCase();
  const start = first.includes('name') && first.includes('price') ? 1 : 0;

  const rows: Row[] = [];
  const errors: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i]);
    if (parts.length < 4) {
      errors.push(`Rand ${i + 1}: 4 coloane necesare (name,description,price,category).`);
      continue;
    }
    const [name, description, priceStr, category] = parts;
    const price = Number(priceStr.replace(',', '.'));
    if (!name || !category || !Number.isFinite(price)) {
      errors.push(`Rand ${i + 1}: date invalide.`);
      continue;
    }
    rows.push({ name, description: description ?? '', price, category });
  }
  return { rows, errors };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

export function CsvImportDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [pending, start] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { rows, errors } = parseCsv(text);
    if (errors.length > 0) {
      toast.error(errors.slice(0, 3).join(' • '));
      return;
    }
    if (rows.length === 0) {
      toast.error('Niciun rand valid.');
      return;
    }
    start(async () => {
      try {
        const result = await bulkImportItemsAction({ rows });
        toast.success(
          `${result.created} produse importate` +
            (result.categoriesCreated > 0 ? ` • ${result.categoriesCreated} categorii noi` : ''),
        );
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Eroare necunoscută');
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <p className="text-xs text-zinc-500">
            Lipește rânduri sub forma <code>name,description,price,category</code>. Header optional.
            Categoriile noi sunt create automat.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={12}
            className="font-mono text-xs rounded-md border border-zinc-200 bg-white p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Anulează
            </Button>
            <Button type="submit" disabled={pending || !text.trim()}>
              {pending ? 'Se importă...' : 'Importă'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
