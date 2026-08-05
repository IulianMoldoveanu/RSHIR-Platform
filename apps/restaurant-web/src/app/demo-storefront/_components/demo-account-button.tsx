'use client';

import { useState } from 'react';
import { MapPin, Receipt, Star, User, X } from 'lucide-react';

// The account glyph, moved here 2026-08-03 from the marketing site's header
// ("omuletul ... as vrea sa apara in contul restaurantului demo, acolo ma
// intereseaza"). On a presentation page it only meant "sign yourself up", which
// isn't how onboarding happens. On a storefront it means the diner's own
// account — saved address, past orders, points — and showing that to a prospect
// is worth something.
//
// It opens a *simulated* account. It cannot open the real one: `/account` is a
// storefront route that resolves its tenant from the host, so on hirforyou.ro
// it would 404. Everything below is fixed sample data, labelled as such, and no
// request leaves the page.

const CUSTOMER = {
  name: 'Ana Popescu',
  phone: '07xx xxx 118',
  address: 'Str. Lipscani 24, ap. 3 — București',
  lastOrder: '2× Margherita, 1× Tiramisu · 78,00 lei',
  points: 240,
};

export function DemoAccountButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Contul meu"
        // Deliberately the same shape as the real storefront's account link and
        // the LocaleSwitcher next to it (h-9 w-9, white, zinc border, shadow) —
        // the pair has to read as one cluster.
        className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-900 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <User className="h-4 w-4" aria-hidden />
        <span className="sr-only">Contul meu</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Închide"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-zinc-900/40"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-account-title"
            className="relative w-full max-w-sm rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--hir-brand)] text-base font-bold text-white">
                  {CUSTOMER.name.slice(0, 1)}
                </span>
                <div>
                  <h2 id="demo-account-title" className="text-base font-bold text-zinc-900">
                    {CUSTOMER.name}
                  </h2>
                  <p className="text-xs text-zinc-500">{CUSTOMER.phone}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="-mr-1 -mt-1 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                <X className="h-4 w-4" aria-hidden />
                <span className="sr-only">Închide</span>
              </button>
            </div>

            <dl className="mt-5 flex flex-col gap-3">
              <Row Icon={MapPin} label="Adresă salvată" value={CUSTOMER.address} />
              <Row Icon={Receipt} label="Ultima comandă" value={CUSTOMER.lastOrder} />
              <Row Icon={Star} label="Puncte de fidelitate" value={`${CUSTOMER.points} puncte`} />
            </dl>

            <p className="mt-5 rounded-xl bg-zinc-50 p-3 text-[11px] leading-relaxed text-zinc-500">
              Cont simulat, cu date de exemplu. Într-un magazin real, clientul își vede aici
              adresele salvate, comenzile anterioare și punctele — și comandă din nou dintr-un
              singur tap.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function Row({
  Icon,
  label,
  value,
}: {
  Icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <dt className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</dt>
        <dd className="text-sm text-zinc-800">{value}</dd>
      </div>
    </div>
  );
}
