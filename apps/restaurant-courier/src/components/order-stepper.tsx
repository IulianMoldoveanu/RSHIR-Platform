import { Check } from 'lucide-react';

// Three-step progress indicator for an assigned order:
//   Accept(at) → Ridica(t) → Livra(t)
// Renders nothing for CREATED / OFFERED (the courier hasn't accepted
// yet, so a stepper is misleading) and for CANCELLED / FAILED (terminal
// states where the stepper would be confusing).
//
// Visual:
//   - completed step: filled violet circle with a check, label in violet
//   - current step:   ringed violet circle pulsing, label in violet
//   - pending step:   muted ring, label muted
//   - connector bar:  fills proportionally based on completed steps

const STEPS = [
  { key: 'accepted', label: 'Acceptat' },
  { key: 'pickup', label: 'Ridicat' },
  { key: 'deliver', label: 'Livrat' },
] as const;

function stateForStatus(status: string): {
  completedThrough: number;
  current: number;
  hidden: boolean;
} {
  switch (status) {
    case 'ACCEPTED':
      return { completedThrough: 0, current: 1, hidden: false };
    case 'PICKED_UP':
    case 'IN_TRANSIT':
      return { completedThrough: 1, current: 2, hidden: false };
    case 'DELIVERED':
      return { completedThrough: 3, current: 3, hidden: false };
    default:
      return { completedThrough: 0, current: 0, hidden: true };
  }
}

export function OrderStepper({ status }: { status: string }) {
  const { completedThrough, current, hidden } = stateForStatus(status);
  if (hidden) return null;

  return (
    <ol
      aria-label="Progres comandă"
      className="flex items-center gap-1.5 rounded-2xl border border-hir-border bg-hir-surface px-4 py-3"
    >
      {STEPS.map((step, idx) => {
        const stepNumber = idx + 1;
        const isDone = stepNumber <= completedThrough;
        const isCurrent = stepNumber === current && !isDone;
        const isPending = !isDone && !isCurrent;

        const circle = isDone
          ? 'bg-violet-500 text-white border-violet-500'
          : isCurrent
            ? 'border-violet-400 text-violet-300 animate-pulse'
            : 'border-hir-border text-hir-muted-fg';
        const labelClass = isPending ? 'text-hir-muted-fg' : 'text-violet-300';
        const connectorClass = isDone ? 'bg-violet-500' : 'bg-hir-border';

        return (
          <li
            key={step.key}
            className="flex flex-1 items-center gap-1.5"
            aria-current={isCurrent ? 'step' : undefined}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${circle}`}
              aria-hidden
            >
              {isDone ? <Check className="h-3.5 w-3.5" /> : stepNumber}
            </span>
            <span className={`truncate text-[11px] font-medium ${labelClass}`}>
              {step.label}
            </span>
            {idx < STEPS.length - 1 ? (
              <span
                aria-hidden
                className={`mx-1 h-[2px] flex-1 rounded-full ${connectorClass}`}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
