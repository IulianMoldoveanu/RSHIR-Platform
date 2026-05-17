import Link from 'next/link';
import { Bell, ChevronLeft } from 'lucide-react';
import { NotificationPreferences } from '@/components/notification-preferences';
import { VoiceNavToggle } from '@/components/voice-nav-toggle';
import { AutoAcceptToggle } from '@/components/auto-accept-toggle';
import { PushTestButton } from '@/components/push-test-button';
import { OfferSoundToggle } from '@/components/offer-sound-toggle';
import { QuietHoursToggle } from '@/components/quiet-hours-toggle';

export const metadata = {
  title: 'Notificări — HIR Curier',
};

// Notification preferences page. Hero-parity with /help + /diagnostics
// + /messages, with sections grouping the toggles by intent: what you
// hear, when you don't want to hear, automation.
export default function NotificationsPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Link
        href="/dashboard/settings"
        className="inline-flex min-h-[32px] items-center gap-1.5 self-start rounded-lg px-1 text-xs font-medium text-hir-muted-fg transition-colors hover:text-hir-fg focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        Setări
      </Link>

      <header className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-500/30">
          <Bell className="h-5 w-5 text-violet-300" aria-hidden />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-hir-fg">
            Preferințe notificări
          </h1>
          <p className="mt-0.5 text-sm leading-relaxed text-hir-muted-fg">
            Decide ce alerte primești, când vrei liniște și ce poate face
            aplicația automat în locul tău.
          </p>
        </div>
      </header>

      <section aria-labelledby="section-alerts" className="space-y-3">
        <h2
          id="section-alerts"
          className="text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg"
        >
          Alerte
        </h2>
        <NotificationPreferences />
        <OfferSoundToggle />
        <PushTestButton />
      </section>

      <section aria-labelledby="section-quiet" className="space-y-3">
        <h2
          id="section-quiet"
          className="text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg"
        >
          Liniște
        </h2>
        <QuietHoursToggle />
      </section>

      <section aria-labelledby="section-auto" className="space-y-3">
        <h2
          id="section-auto"
          className="text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg"
        >
          Automatizare
        </h2>
        <VoiceNavToggle />
        <AutoAcceptToggle />
      </section>
    </div>
  );
}
