import { Check } from 'lucide-react';
import { STATUS_LABEL_RO } from './order-status-badge';

/**
 * Vertical state-machine timeline for a courier order. Mirrors the
 * `courier_orders.status` enum stages relevant to the courier's flow.
 * Labels are pulled from the shared STATUS_LABEL_RO source so the
 * timeline never drifts from the pill rendered on list + detail pages.
 *
 *   OFFERED → "Oferită"
 *   ACCEPTED → "Acceptată"
 *   PICKED_UP → "Ridicată"
 *   IN_TRANSIT → "În livrare"
 *   DELIVERED → "Livrată"
 *
 * Past stages: solid purple line + check. Current: pulsing dot. Future: muted.
 *
 * Note: `CREATED` collapses into `OFFERED` for display — the courier doesn't
 * care about the internal "just inserted" half-second. `CANCELLED` is rendered
 * as a separate banner by the parent, not a stage.
 */
const STAGES = [
  { key: 'OFFERED', label: STATUS_LABEL_RO.OFFERED },
  { key: 'ACCEPTED', label: STATUS_LABEL_RO.ACCEPTED },
  { key: 'PICKED_UP', label: STATUS_LABEL_RO.PICKED_UP },
  { key: 'IN_TRANSIT', label: STATUS_LABEL_RO.IN_TRANSIT },
  { key: 'DELIVERED', label: STATUS_LABEL_RO.DELIVERED },
] as const;

type StageKey = (typeof STAGES)[number]['key'];

function normalizeStatus(status: string): StageKey {
  if (status === 'CREATED') return 'OFFERED';
  if (STAGES.some((s) => s.key === status)) return status as StageKey;
  // Unknown status → treat as earliest stage so we don't crash.
  return 'OFFERED';
}

export function OrderTimeline({ status }: { status: string }) {
  const current = normalizeStatus(status);
  const currentIdx = STAGES.findIndex((s) => s.key === current);

  return (
    <ol className="relative flex flex-col gap-4 pl-6" aria-label="Stadiu comandă">
      {STAGES.map((stage, idx) => {
        const isPast = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const isFuture = idx > currentIdx;

        return (
          <li key={stage.key} className="relative">
            {/* Vertical connector line (skip on the last item). */}
            {idx < STAGES.length - 1 ? (
              <span
                className={`absolute left-[-1.125rem] top-5 h-[calc(100%+1rem)] w-px ${
                  isPast ? 'bg-violet-500' : 'bg-zinc-800'
                }`}
                aria-hidden
              />
            ) : null}

            {/* Marker dot. */}
            <span
              className={`absolute left-[-1.5rem] top-1 flex h-4 w-4 items-center justify-center rounded-full ${
                isPast
                  ? 'bg-violet-500'
                  : isCurrent
                  ? 'dot-pulse bg-violet-500'
                  : 'bg-zinc-800'
              }`}
              aria-hidden
            >
              {isPast ? <Check className="h-2.5 w-2.5 text-white" /> : null}
            </span>

            <div
              className={`text-sm ${
                isCurrent
                  ? 'font-semibold text-zinc-100'
                  : isFuture
                  ? 'text-zinc-500'
                  : 'text-zinc-300'
              }`}
            >
              {stage.label}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
