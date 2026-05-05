import QRCode from 'qrcode';
import { Share2 } from 'lucide-react';
import { StorefrontShareActions } from './storefront-share-actions';

// Driving the first-order flywheel: restaurants forget to share their HIR
// link → no orders → churn. Putting the storefront URL on the dashboard
// home with one-tap copy + WhatsApp + Telegram share is the single highest-
// leverage retention nudge for the first 30 days.
//
// The QR is generated server-side so there is zero JS bundle cost for the
// image — the browser receives a static inline SVG.

type Props = {
  storefrontUrl: string;
  tenantName: string;
};

export async function StorefrontShareTile({ storefrontUrl, tenantName }: Props) {
  const qrSvg = await QRCode.toString(storefrontUrl, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
  });

  return (
    <section
      id="share"
      aria-label="Distribuie storefrontul"
      className="rounded-xl border border-zinc-200 bg-white p-5"
    >
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        <Share2 className="h-3.5 w-3.5" aria-hidden />
        Linkul tău de comandă
      </p>
      <h2 className="mt-1 text-base font-semibold text-zinc-900">Distribuie pe canalele tale</h2>

      {/* Two-column on sm+, stacked on mobile */}
      <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
        {/* Left: URL bar + share buttons */}
        <div className="min-w-0 flex-1">
          <StorefrontShareActions storefrontUrl={storefrontUrl} tenantName={tenantName} />

          <p className="mt-3 text-xs text-zinc-500">
            Postează linkul în story-uri Instagram, în descrierea Google Maps, sau lipește un QR pe
            masă. Fiecare comandă pe HIR e cu 30% mai profitabilă decât pe Wolt sau Glovo.
          </p>
        </div>

        {/* Right: QR code */}
        <div className="flex flex-col items-center gap-2 self-start">
          <div
            className="rounded-lg border border-zinc-200 bg-white p-2 shadow-sm"
            aria-label={`Cod QR pentru ${storefrontUrl}`}
          >
            {/* Mobile: 140px, desktop (sm+): 160px */}
            <div
              className="h-[140px] w-[140px] sm:h-[160px] sm:w-[160px]"
              // dangerouslySetInnerHTML is safe here — qrcode generates a
              // deterministic, parameter-controlled SVG with no user input
              // embedded in script or event attributes.
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          </div>
          <p className="max-w-[160px] text-center text-[11px] leading-snug text-zinc-500">
            Tipărește acest cod și pune-l pe masă. Clienții scanează și comandă direct, fără
            comision.
          </p>
        </div>
      </div>
    </section>
  );
}
