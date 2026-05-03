'use client';

// Floating "Raportează problemă" button shown bottom-right on every dashboard
// route. Click → opens FeedbackModal. Installs the console buffer on first
// render so the modal can attach the last console.error/warn lines.

import { useEffect, useState } from 'react';
import { Bug } from 'lucide-react';
import { FeedbackModal } from './feedback-modal';
import { installConsoleBuffer } from '@/lib/console-buffer';

type Props = { tenantId: string };

export function FeedbackFab({ tenantId }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    installConsoleBuffer();
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Raportează problemă"
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-purple-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700 focus-visible:ring-offset-2 sm:bottom-6 sm:right-6"
      >
        <Bug className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Raportează problemă</span>
        <span className="sm:hidden">Eroare</span>
      </button>
      <FeedbackModal open={open} onOpenChange={setOpen} tenantId={tenantId} />
    </>
  );
}
