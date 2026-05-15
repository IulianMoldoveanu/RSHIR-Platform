import { Headphones, Phone } from 'lucide-react';

// HIR courier support Telegram link — static fallback.
const HIR_SUPPORT_HREF = 'https://t.me/HIRcuriersupport';

type Props = {
  /** contact_phone from courier_fleets, if available. */
  fleetContactPhone: string | null;
  /** Name of the fleet, for the aria-label. */
  fleetName: string | null;
};

/**
 * Two compact call/contact buttons shown on the order detail page
 * while the courier is in an active delivery (ACCEPTED / PICKED_UP /
 * IN_TRANSIT). Rendered below the customer phone link inside the
 * dropoff card.
 *
 * - "Dispecer" -> tel: to the fleet's contact_phone, if set.
 *   Hidden when the fleet has no contact phone configured.
 * - "Suport HIR" -> Telegram link (always shown as a fallback).
 *
 * Pure server component — no client state needed.
 */
export function QuickCallButtons({ fleetContactPhone, fleetName }: Props) {
  const hasDispatcher = !!fleetContactPhone;

  return (
    <div className="flex flex-wrap gap-2">
      {hasDispatcher ? (
        <a
          href={`tel:${fleetContactPhone}`}
          aria-label={fleetName ? `Sunati dispecerul ${fleetName}` : 'Sunati dispecerul'}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20"
        >
          <Phone className="h-3.5 w-3.5" aria-hidden />
          Dispecer
        </a>
      ) : null}

      <a
        href={HIR_SUPPORT_HREF}
        target="_blank"
        rel="noreferrer"
        aria-label="Suport HIR via Telegram"
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-hir-border bg-hir-surface px-3 py-1.5 text-xs font-medium text-hir-muted-fg hover:border-violet-500/40 hover:text-hir-fg"
      >
        <Headphones className="h-3.5 w-3.5" aria-hidden />
        Suport HIR
      </a>
    </div>
  );
}
