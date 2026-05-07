import Link from 'next/link';
import { Sparkles } from 'lucide-react';

/**
 * Shown when tenants.feature_flags.inventory_enabled is falsy. Premium tier
 * upsell — keeps copy formal RO ("dumneavoastră"), no pricing inline (HIR
 * pricing strategy is Tier 1 / Tier 2 / Reseller, communicated via /pricing).
 */
export function InventoryUpsell() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
            <Sparkles className="h-5 w-5 text-purple-600" aria-hidden />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Stocuri inteligente — funcționalitate Premium
          </h1>
        </div>

        <p className="mt-4 text-sm leading-6 text-zinc-600">
          Modulul de stocuri vă permite să urmăriți cantitățile rămase,
          să primiți alerte când stocul scade sub prag și să generați
          automat comenzi de aprovizionare către furnizori. Stocurile se
          decrementează automat la fiecare comandă livrată.
        </p>

        <ul className="mt-5 space-y-2 text-sm text-zinc-700">
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-purple-600" aria-hidden />
            <span>Stocuri curente per ingredient + alerte sub prag</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-purple-600" aria-hidden />
            <span>Rețete (ingredient ↔ produs din meniu) cu cantitate per porție</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-purple-600" aria-hidden />
            <span>Decrementare automată la livrare + jurnal mișcări</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-purple-600" aria-hidden />
            <span>Comenzi DRAFT către furnizori (în lucru)</span>
          </li>
        </ul>

        <div className="mt-6 rounded-lg border border-zinc-100 bg-zinc-50 p-4 text-sm text-zinc-600">
          Pentru a activa modulul pentru restaurantul dumneavoastră,
          contactați echipa HIR.
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard/help"
            className="inline-flex items-center justify-center rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
          >
            Solicitați activarea
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Înapoi la dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
