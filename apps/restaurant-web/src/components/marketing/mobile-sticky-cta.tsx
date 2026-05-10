// SEO audit 2026-05-10 #5 — bottom-fixed CTA bar for mobile viewports.
// Three actions: Sună (tel:), WhatsApp, Programează demo (→/contact).
// Hidden on md+ where the inline page CTAs are visible above the fold;
// shown on < md where the visitor scrolls a long copy-heavy landing.
//
// Pure server component — no hooks, no JS hydration cost. Z-index sits
// above the page content but below the cookie banner so the GDPR notice
// remains tappable.

import Link from 'next/link';
import { Phone, MessageCircle, Calendar } from 'lucide-react';

const PHONE_DIGITS = '40743700916';
const PHONE_DISPLAY = '0743 700 916';

export function MobileStickyCta() {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E2E8F0] bg-white/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-2px_8px_rgba(15,23,42,0.06)] backdrop-blur md:hidden"
      role="region"
      aria-label="Contactați HIR"
    >
      <div className="mx-auto flex max-w-md items-stretch gap-2">
        <a
          href={`tel:+${PHONE_DIGITS}`}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-md bg-white px-2 py-2 text-[11px] font-medium text-[#0F172A] ring-1 ring-inset ring-[#E2E8F0] transition-colors active:bg-[#F8FAFC]"
          aria-label={`Sunați HIR la ${PHONE_DISPLAY}`}
        >
          <Phone className="h-4 w-4 text-[#4F46E5]" aria-hidden />
          <span>Sună HIR</span>
        </a>
        <a
          href={`https://wa.me/${PHONE_DIGITS}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-md bg-emerald-600 px-2 py-2 text-[11px] font-semibold text-white shadow-sm transition-colors active:bg-emerald-700"
          aria-label="Trimiteți mesaj pe WhatsApp"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          <span>WhatsApp</span>
        </a>
        <Link
          href="/contact"
          className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-md bg-[#4F46E5] px-2 py-2 text-[11px] font-semibold text-white shadow-sm transition-colors active:bg-[#4338CA]"
          aria-label="Programați un demo HIR"
        >
          <Calendar className="h-4 w-4" aria-hidden />
          <span>Demo</span>
        </Link>
      </div>
    </div>
  );
}
