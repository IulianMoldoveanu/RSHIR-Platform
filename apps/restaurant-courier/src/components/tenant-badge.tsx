import { Store } from 'lucide-react';

// Small pill that surfaces the source tenant name on a courier order
// card. Rendered ONLY when the rider is in Mode B (multi-vendor) — a
// solo Mode A rider only ever sees orders from their one tenant and a
// tenant badge would be visual noise; Mode C riders are dispatched
// externally and never see the tenant context here.
//
// Visual is intentionally muted (zinc 800 fill, no semantic color) so
// it sits below the OrderStatusBadge / VerticalBadge in the visual
// hierarchy — the rider's question is "what should I do next" first,
// "for whom" second. A small Store icon gives the badge a clear
// "this is the source restaurant/pharmacy" cue.

export function TenantBadge({ name }: { name: string | null }) {
  if (!name) return null;
  return (
    <span
      className="inline-flex max-w-[140px] items-center gap-1 truncate rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-300 ring-1 ring-inset ring-zinc-700/60"
      title={name}
    >
      <Store className="h-3 w-3 shrink-0 text-zinc-400" aria-hidden strokeWidth={2.25} />
      <span className="truncate">{name}</span>
    </span>
  );
}
