// Lane INVENTORY-FOLLOWUP PR 4 (2026-05-07) — OWNER toggle for the
// inventory feature flag. Replaces "edit feature_flags via SQL" friction.
// Shows current item + movement counts so OWNERs see impact before
// disabling.

import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import {
  countInventoryItems,
  countMovements,
  isInventoryEnabled,
} from '@/lib/inventory';
import { InventoryToggleForm } from './toggle-form';

export const dynamic = 'force-dynamic';

export default async function InventorySettingsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-sm text-zinc-700">
        Sesiunea a expirat. <Link href="/login" className="text-purple-700 hover:underline">Autentificați-vă</Link>.
      </div>
    );
  }

  const { tenant } = await getActiveTenant();
  const [role, enabled, itemCount, movementCount] = await Promise.all([
    getTenantRole(user.id, tenant.id),
    isInventoryEnabled(tenant.id),
    countInventoryItems(tenant.id),
    countMovements(tenant.id),
  ]);
  const isOwner = role === 'OWNER';

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link
        href="/dashboard/settings"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-600 transition-colors hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Înapoi la setări
      </Link>

      <header className="mt-3 flex items-start gap-3">
        <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-purple-50">
          <Sparkles className="h-4 w-4 text-purple-600" aria-hidden />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Stocuri inteligente
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Activați pentru a urmări ingrediente, rețete și mișcări de stoc.
            Stocul se decrementează automat la fiecare comandă livrată.
          </p>
        </div>
      </header>

      <section className="mt-6">
        <InventoryToggleForm
          initialEnabled={enabled}
          isOwner={isOwner}
          itemCount={itemCount}
          movementCount={movementCount}
        />
      </section>

      {/* Counters: visible regardless of state, so OWNERs see impact. */}
      <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Ingrediente urmărite
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
            {itemCount}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Mișcări înregistrate
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
            {movementCount}
          </p>
        </div>
      </section>

      {/* Quick links when enabled. */}
      {enabled ? (
        <section className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard/inventory"
            className="inline-flex items-center justify-center rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
          >
            Deschideți stocurile
          </Link>
          <Link
            href="/dashboard/inventory/movements"
            className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Vedeți jurnalul mișcărilor
          </Link>
        </section>
      ) : null}

      <section className="mt-8 rounded-lg border border-zinc-100 bg-zinc-50/50 px-4 py-3 text-xs text-zinc-600">
        <p className="font-medium text-zinc-700">Cum funcționează</p>
        <ul className="mt-1.5 space-y-1">
          <li>
            • Adăugați ingrediente și legați-le de produsele din meniu (rețete).
          </li>
          <li>
            • La fiecare comandă livrată, stocul se decrementează automat în
            funcție de cantitatea per porție.
          </li>
          <li>
            • Pentru inventar fizic sau pierderi, folosiți „Ajustare manuală”
            din pagina de detaliu a ingredientului.
          </li>
        </ul>
      </section>
    </div>
  );
}
