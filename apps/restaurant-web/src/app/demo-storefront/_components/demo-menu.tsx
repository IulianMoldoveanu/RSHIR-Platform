'use client';

import { Plus } from 'lucide-react';
import type { MenuCategory } from '@/lib/menu';
import { useDemoCartStore } from '@/lib/demo/demo-cart-store';

export function DemoMenu({ categories }: { categories: MenuCategory[] }) {
  const addItem = useDemoCartStore((s) => s.addItem);

  if (categories.length === 0) {
    return <p className="mt-8 text-sm text-zinc-500">Meniul demo nu este încă disponibil.</p>;
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      {categories.map((cat) => (
        <section key={cat.id}>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-zinc-500">{cat.name}</h2>
          <div className="flex flex-col gap-2">
            {cat.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-900">{item.name}</p>
                  {item.description && (
                    <p className="truncate text-xs text-zinc-500">{item.description}</p>
                  )}
                  <p className="mt-1 text-sm font-bold text-[var(--hir-brand)]">
                    {item.price_ron.toFixed(2)} lei
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    addItem({
                      itemId: item.id,
                      name: item.name,
                      unitPriceRon: item.price_ron,
                      imageUrl: item.image_url,
                      modifiers: [],
                    })
                  }
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--hir-brand)] text-white"
                  aria-label={`Adaugă ${item.name} în coș`}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
