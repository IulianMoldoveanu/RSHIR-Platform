import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { NotificationPreferences } from '@/components/notification-preferences';
import { VoiceNavToggle } from '@/components/voice-nav-toggle';
import { AutoAcceptToggle } from '@/components/auto-accept-toggle';
import { PushTestButton } from '@/components/push-test-button';
import { OfferSoundToggle } from '@/components/offer-sound-toggle';

export const metadata = {
  title: 'Notificări — HIR Curier',
};

export default function NotificationsPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <Link
        href="/dashboard/settings"
        className="flex min-h-[44px] items-center gap-1 self-start text-sm text-hir-muted-fg hover:text-hir-fg"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Setări
      </Link>

      <h1 className="text-xl font-bold text-hir-fg">Preferințe notificări</h1>

      <NotificationPreferences />

      <OfferSoundToggle />

      <PushTestButton />

      <VoiceNavToggle />

      <AutoAcceptToggle />
    </div>
  );
}
