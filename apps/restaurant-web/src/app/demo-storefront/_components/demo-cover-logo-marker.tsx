import { ImageIcon } from 'lucide-react';

// The "YOUR LOGO" marker on the demo storefront's cover.
//
// It marks a position and nothing else. Iulian, 2026-08-04: "SI NU TREBUIE SA
// POATA ADAUGA CEVA PROPRIU ZIS IN DEMO. TREBUIE SA FIE DOAR POZITIONAREA CU UN
// SCRIS DE GENUL 'YOUR LOGO' IAR ACOLO SA ISI POATA POZITIONA LOGUL DACA
// DORESTE, DAR DOAR LA CONFIGURARE." An earlier version let the visitor upload
// their own file and previewed it here; that is gone. Onboarding is done in
// person (we configure the account, there is no self-service), so a demo that
// invites people to upload things sets the wrong expectation about how they
// start.
//
// The position is real, not decorative. A tenant's own mark renders in exactly
// this spot on their storefront — `branding.cover_logo_url`, set in admin at
// Setări → Branding, drawn by tenant-header.tsx at the same offset and size.
// A tenant who has not configured one sees nothing there; this placeholder is
// demo-only and must never appear on a real storefront, where a diner would
// read it as a broken image.
//
// Server component on purpose: there is no interaction left to hydrate.

export function DemoCoverLogoMarker() {
  return (
    <div
      className="absolute left-3 top-3 flex h-10 items-center gap-2 rounded-lg border border-dashed border-white/70 bg-black/30 px-3 backdrop-blur-sm sm:left-4 sm:top-4"
      // Same left/top offset and height as the real mark in tenant-header.tsx,
      // so what a prospect sees here is where their logo actually lands.
      title="Logo-ul tău apare aici. Îl punem noi când îți configurăm contul."
    >
      <ImageIcon className="h-4 w-4 flex-none text-white/80" aria-hidden />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-white">
        Logo-ul tău
      </span>
    </div>
  );
}
