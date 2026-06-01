import Link from 'next/link';
import { CalendarClock, Camera, ChevronLeft, History } from 'lucide-react';
import { SettingsRow } from '@/components/settings-row';

export const dynamic = 'force-dynamic';

// "Program & curse" hub — groups the three work-related screens that used to
// sit loose in the Settings list (schedule / ride history / delivery photos).
export default function WorkSettingsPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <header className="flex items-center gap-3">
        <Link
          href="/dashboard/settings"
          aria-label="Înapoi la setări"
          className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full bg-hir-surface text-hir-muted-fg ring-1 ring-hir-border transition-colors hover:text-hir-fg"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </Link>
        <h1 className="text-lg font-semibold tracking-tight text-hir-fg">Program &amp; curse</h1>
      </header>

      <div className="flex flex-col gap-3">
        <SettingsRow
          href="/dashboard/schedule"
          icon={<CalendarClock className="h-5 w-5 text-violet-400" aria-hidden />}
          label="Program săptămânal"
          description="Rezervă ture pentru 7 zile înainte"
        />
        <SettingsRow
          href="/dashboard/history"
          icon={<History className="h-5 w-5 text-violet-400" aria-hidden />}
          label="Istoricul curselor"
          description="Ultimele 100 de comenzi finalizate"
        />
        <SettingsRow
          href="/dashboard/proofs"
          icon={<Camera className="h-5 w-5 text-violet-400" aria-hidden />}
          label="Fotografii livrări"
          description="Arhivă dovezi livrare, ultimele 30 zile"
        />
      </div>
    </div>
  );
}
