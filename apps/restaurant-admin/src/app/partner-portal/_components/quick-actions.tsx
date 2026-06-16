// Quick-action bar — primary CTAs surfaced above the fold on the
// partner portal landing. Pure server component (Link only).
//
// Each action maps to an existing route. The "Distribuie materiale"
// action targets the new marketing library (sibling page); "Adaugă lead"
// → /leads; "Invită co-reseller" → /team; "Calculator" → /calculator.

import Link from 'next/link';
import { Plus, Users, Calculator, Download } from 'lucide-react';
import type { ReactNode } from 'react';

type Action = {
  href: string;
  label: string;
  hint: string;
  icon: ReactNode;
};

const ACTIONS: Action[] = [
  {
    href: '/partner-portal/leads',
    label: 'Adaugă lead',
    hint: 'Blochează 30 zile exclusivitate',
    icon: <Plus className="h-4 w-4" aria-hidden />,
  },
  {
    href: '/partner-portal/team',
    label: 'Invită co-reseller',
    hint: '10% Y1 + €200 bonus',
    icon: <Users className="h-4 w-4" aria-hidden />,
  },
  {
    href: '/partner-portal/calculator',
    label: 'Calculator',
    hint: 'Simulează câștigurile',
    icon: <Calculator className="h-4 w-4" aria-hidden />,
  },
  {
    href: '/partner-portal/marketing',
    label: 'Materiale',
    hint: 'PDF / video / e-mailuri',
    icon: <Download className="h-4 w-4" aria-hidden />,
  },
];

export function QuickActions() {
  return (
    <nav
      aria-label="Acțiuni rapide"
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {ACTIONS.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="group flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-purple-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
        >
          <span
            aria-hidden
            className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-purple-100 text-purple-700 transition-colors group-hover:bg-purple-200"
          >
            {a.icon}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-zinc-900">
              {a.label}
            </span>
            <span className="block truncate text-[11px] text-zinc-500">
              {a.hint}
            </span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
