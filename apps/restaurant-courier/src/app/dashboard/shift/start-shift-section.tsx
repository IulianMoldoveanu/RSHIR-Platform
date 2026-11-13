'use client';

import { SwipeButton } from '@/components/swipe-button';

type Props = {
  startShiftAction: () => Promise<void>;
};

/**
 * Client wrapper for the "start shift" half of the shift page.
 *
 * This used to put a pre-shift checklist in front of the swipe button, which
 * the courier had to click through before they could go online. Starting a
 * shift is one gesture now. `PreShiftChecklist` is still in the tree, so
 * restoring the gate is a two-line change if a real reason for it appears.
 */
export function StartShiftSection({ startShiftAction }: Props) {
  return (
    <SwipeButton
      label="→ Glisează pentru a porni tura"
      onConfirm={startShiftAction}
    />
  );
}
