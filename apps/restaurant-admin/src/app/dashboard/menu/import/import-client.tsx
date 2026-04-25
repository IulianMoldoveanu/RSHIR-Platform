'use client';

import { useState, useTransition, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, toast } from '@hir/ui';
import { ReviewTable, type ReviewRow } from './review-table';

const ACCEPT = 'application/pdf,image/jpeg,image/png';
const MAX_BYTES = 8 * 1024 * 1024;

type ParsedItem = {
  name: string;
  description?: string;
  price_ron: number;
  flagged?: boolean;
};
type ParsedCategory = { name: string; items: ParsedItem[] };
type ParseResponse = { uploadId: string; path: string; parsed: { categories: ParsedCategory[] } };

function flatten(categories: ParsedCategory[]): ReviewRow[] {
  const rows: ReviewRow[] = [];
  for (const cat of categories) {
    for (const it of cat.items) {
      rows.push({
        id: crypto.randomUUID(),
        include: !it.flagged,
        category: cat.name,
        name: it.name,
        description: it.description ?? '',
        price_ron: Number.isFinite(it.price_ron) ? it.price_ron : 0,
        flagged: Boolean(it.flagged),
      });
    }
  }
  return rows;
}

export function ImportClient() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [committing, start] = useTransition();

  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > MAX_BYTES) {
      toast.error('Fisierul depaseste 8 MB.');
      return;
    }
    setFile(f);
    setRows(null);
  }

  async function onParse() {
    if (!file) return;
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/menu/import/parse', {
        method: 'POST',
        body: fd,
      });
      const json = (await res.json()) as ParseResponse | { error: string };
      if (!res.ok || 'error' in json) {
        throw new Error('error' in json ? json.error : 'Parsare esuata');
      }
      const flat = flatten(json.parsed.categories);
      if (flat.length === 0) {
        toast.error('Niciun produs detectat. Incearca alt fisier.');
        setRows([]);
        return;
      }
      setRows(flat);
      toast.success(`${flat.length} produse extrase. Verifica si confirma.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eroare necunoscuta');
    } finally {
      setParsing(false);
    }
  }

  function onCommit(selected: ReviewRow[]) {
    if (selected.length === 0) {
      toast.error('Selecteaza cel putin un produs.');
      return;
    }
    start(async () => {
      try {
        const res = await fetch('/api/menu/import/commit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            rows: selected.map((r) => ({
              category: r.category,
              name: r.name,
              description: r.description,
              price_ron: r.price_ron,
            })),
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Salvare esuata');
        toast.success(`${json.created} produse importate.`);
        router.push('/dashboard/menu');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Eroare necunoscuta');
      }
    });
  }

  if (rows === null) {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-6">
        <div>
          <h2 className="text-sm font-medium text-zinc-900">Incarca meniul</h2>
          <p className="mt-1 text-xs text-zinc-500">
            PDF, JPEG sau PNG. Maxim 8 MB. Claude Vision va extrage categoriile,
            produsele si preturile pentru verificare.
          </p>
        </div>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-6 py-10 text-sm text-zinc-600 hover:bg-zinc-100">
          <input
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={onPickFile}
          />
          <span className="font-medium">
            {file ? file.name : 'Click pentru a alege un fisier'}
          </span>
          <span className="text-xs text-zinc-500">
            {file
              ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
              : 'sau drag & drop'}
          </span>
        </label>
        <div className="flex justify-end">
          <Button onClick={onParse} disabled={!file || parsing}>
            {parsing ? 'Se proceseaza... (~30s)' : 'Proceseaza cu AI'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ReviewTable
      rows={rows}
      onChange={setRows}
      onSubmit={onCommit}
      onReset={() => {
        setRows(null);
        setFile(null);
      }}
      submitting={committing}
    />
  );
}
