'use client';

import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { Button, toast } from '@hir/ui';

type PermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

/**
 * "Trimite notificare test" button on Setări → Notificări.
 *
 * Fires a local Notification through the registered service worker (if any),
 * falling back to the page-level Notification constructor. Lets the courier
 * verify end-to-end that:
 *   - browser permission is granted
 *   - service worker can deliver heads-up notifications
 *   - sound + vibration are working on the device
 *
 * Pure client. Does not touch the backend push queue. Operators sometimes
 * confuse the local test with the real subscription path, so the
 * description spells it out.
 */
export function PushTestButton() {
  const [perm, setPerm] = useState<PermissionState>('default');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) {
      setPerm('unsupported');
      return;
    }
    setPerm(Notification.permission as PermissionState);
  }, []);

  async function sendTest() {
    if (perm === 'unsupported') {
      toast('Dispozitivul tău nu suportă notificările.', { duration: 5_000 });
      return;
    }

    if (perm !== 'granted') {
      // Must be called inside a user-gesture handler. Re-asks only when not
      // already denied; if denied, point the courier to the OS settings.
      if (perm === 'denied') {
        toast(
          'Notificările sunt blocate la nivel de dispozitiv. Activează-le din setările sistemului.',
          { duration: 7_000 },
        );
        return;
      }
      const newPerm = (await Notification.requestPermission()) as PermissionState;
      setPerm(newPerm);
      if (newPerm !== 'granted') return;
    }

    const title = 'Test notificare HIR Curier';
    const body = 'Așa va arăta o alertă reală pentru o comandă nouă.';
    const options: NotificationOptions = {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      tag: 'hir-push-test',
      requireInteraction: false,
      // vibrate isn't in the lib type but is widely supported via SW.
    };

    // Prefer the registered service worker so the notification looks
    // identical to a real push delivery (heads-up, OS-tray, etc.).
    let delivered = false;
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.showNotification(title, options);
          delivered = true;
        }
      } catch {
        // fall through to page-level
      }
    }
    if (!delivered) {
      try {
        new Notification(title, options);
        delivered = true;
      } catch {
        // ignore
      }
    }

    if (delivered) {
      toast.success('Notificare test trimisă.', { duration: 3_000 });
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([120, 60, 120]);
      }
    } else {
      toast('Nu am putut trimite notificarea. Reîncearcă.', { duration: 5_000 });
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-hir-border bg-hir-surface p-4">
      <div className="flex items-start gap-3">
        <BellRing className="mt-1 h-5 w-5 shrink-0 text-violet-400" aria-hidden />
        <div className="flex flex-1 flex-col gap-1">
          <p className="text-sm font-semibold text-hir-fg">Test notificare locală</p>
          <p className="text-xs text-hir-muted-fg">
            Trimite o notificare către acest dispozitiv pentru a verifica
            sunetul și vibrația. Nu trimite nimic către alți curieri sau
            către dispecer.
          </p>
        </div>
      </div>
      <Button
        onClick={sendTest}
        variant="outline"
        size="sm"
        className="self-start"
        disabled={perm === 'unsupported'}
      >
        {perm === 'unsupported' ? 'Indisponibil pe acest dispozitiv' : 'Trimite notificare test'}
      </Button>
    </div>
  );
}
