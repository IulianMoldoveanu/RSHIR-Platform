'use client';

import type { LiveOrder, CourierOrderStatus } from '../page';
import type { FilterTab } from './live-orders-client';

const ACTIVE_SET: Set<CourierOrderStatus> = new Set([
  'CREATED',
  'OFFERED',
  'ACCEPTED',
  'PICKED_UP',
  'IN_TRANSIT',
]);

type Props = {
  active: FilterTab;
  onChange: (tab: FilterTab) => void;
  orders: LiveOrder[];
};

export function FilterChips({ active, onChange, orders }: Props) {
  const counts: Record<FilterTab, number> = {
    all: orders.length,
    active: orders.filter((o) => ACTIVE_SET.has(o.status)).length,
    delivered: orders.filter((o) => o.status === 'DELIVERED').length,
    cancelled: orders.filter((o) => o.status === 'CANCELLED').length,
  };

  const chips: Array<{ value: FilterTab; label: string }> = [
    { value: 'all', label: 'Toate' },
    { value: 'active', label: 'In curs' },
    { value: 'delivered', label: 'Livrate' },
    { value: 'cancelled', label: 'Anulate' },
  ];

  return (
    <nav aria-label="Filtreaza comenzile" className="flex flex-wrap gap-1.5">
      {chips.map((c) => {
        const isActive = c.value === active;
        return (
          <button
            key={c.value}
            type="button"
            onClick={() => onChange(c.value)}
            aria-pressed={isActive}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              isActive
                ? 'border-purple-600 bg-purple-600 text-white'
                : 'border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400 hover:text-zinc-900'
            }`}
          >
            {c.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                isActive ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-500'
              }`}
            >
              {counts[c.value]}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
