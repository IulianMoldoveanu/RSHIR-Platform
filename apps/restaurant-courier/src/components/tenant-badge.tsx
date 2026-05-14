// Small pill that surfaces the source tenant name on a courier order
// card. Rendered ONLY when the rider is in Mode B (multi-vendor) — a
// solo Mode A rider only ever sees orders from their one tenant and a
// tenant badge would be visual noise; Mode C riders are dispatched
// externally and never see the tenant context here.
//
// Visual is intentionally muted (zinc 800 fill, no semantic color) so
// it sits below the OrderStatusBadge / VerticalBadge in the visual
// hierarchy — the rider's question is "what should I do next" first,
// "for whom" second.

export function TenantBadge({ name }: { name: string | null }) {
  if (!name) return null;
  return (
    <span
      className="max-w-[120px] truncate rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-300"
      title={name}
    >
      {name}
    </span>
  );
}
