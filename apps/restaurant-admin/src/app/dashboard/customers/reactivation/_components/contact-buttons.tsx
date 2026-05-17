'use client';

import { useState, useTransition } from 'react';
import { MessageCircle, Phone, Check } from 'lucide-react';
import { markContacted } from '../actions';
import { whatsappUrl } from '@/lib/reactivation-templates';

interface Props {
  tenantId: string;
  customerPhone: string;
  message: string;
}

export function ContactButtons({ tenantId, customerPhone, message }: Props) {
  const [contacted, setContacted] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleWhatsApp() {
    window.open(whatsappUrl(customerPhone, message), '_blank', 'noopener,noreferrer');
    startTransition(async () => {
      await markContacted({
        expectedTenantId: tenantId,
        customerPhone,
        channel: 'whatsapp',
        template: message,
      });
      setContacted(true);
    });
  }

  function handleSms() {
    navigator.clipboard.writeText(message).catch(() => {
      // fallback: open sms: link if clipboard blocked
      window.location.href = `sms:${customerPhone}?body=${encodeURIComponent(message)}`;
    });
    startTransition(async () => {
      await markContacted({
        expectedTenantId: tenantId,
        customerPhone,
        channel: 'sms',
        template: message,
      });
      setContacted(true);
    });
  }

  if (contacted) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700">
        <Check className="h-3.5 w-3.5" aria-hidden />
        Contactat
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleWhatsApp}
        disabled={pending}
        aria-label={`Trimite WhatsApp la ${customerPhone}`}
        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        <MessageCircle className="h-3.5 w-3.5" aria-hidden />
        WhatsApp
      </button>
      <button
        type="button"
        onClick={handleSms}
        disabled={pending}
        aria-label={`Copiază template SMS pentru ${customerPhone}`}
        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        <Phone className="h-3.5 w-3.5" aria-hidden />
        SMS
      </button>
    </div>
  );
}
