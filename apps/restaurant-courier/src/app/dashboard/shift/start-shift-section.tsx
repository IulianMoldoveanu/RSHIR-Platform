'use client';

import { useState } from 'react';
import { PreShiftChecklist } from '@/components/pre-shift-checklist';
import { SwipeButton } from '@/components/swipe-button';

type Props = {
  startShiftAction: () => Promise<void>;
};

/**
 * Client wrapper for the "start shift" half of the shift page.
 * Shows the pre-shift checklist first; once the courier clicks through
 * (or dismisses permanently) the normal swipe button appears.
 */
export function StartShiftSection({ startShiftAction }: Props) {
  const [checklistDone, setChecklistDone] = useState(false);

  if (checklistDone) {
    return (
      <SwipeButton
        label="→ Glisează pentru a porni tura"
        onConfirm={startShiftAction}
      />
    );
  }

  return (
    <PreShiftChecklist onContinue={() => setChecklistDone(true)} />
  );
}
