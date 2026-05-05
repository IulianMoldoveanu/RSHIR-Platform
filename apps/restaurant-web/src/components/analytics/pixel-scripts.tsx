import Script from 'next/script';

/**
 * Lane I (2026-05-04) — opt-in tenant analytics.
 *
 * Tenants paste their Facebook Pixel ID (`fb_pixel_id`) and / or GA4
 * Measurement ID (`ga4_measurement_id`) in admin → Settings. We only
 * inject the script tags when the IDs are set, and we use Next.js
 * `<Script strategy="afterInteractive">` so the marketing scripts never
 * block paint. Privacy-by-default: no tracking when no ID configured.
 *
 * IDs are sanitised here (alphanumeric + dash + `G-`) so a tenant typo
 * can't inject arbitrary JS. We never echo raw user input into the
 * script template.
 */
type Props = {
  fbPixelId?: string | null;
  ga4MeasurementId?: string | null;
};

const FB_PIXEL_RE = /^[0-9]{6,20}$/;
const GA4_RE = /^G-[A-Z0-9]{4,20}$/;

function safeFbPixelId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return FB_PIXEL_RE.test(trimmed) ? trimmed : null;
}

function safeGa4Id(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toUpperCase();
  return GA4_RE.test(trimmed) ? trimmed : null;
}

export function PixelScripts({ fbPixelId, ga4MeasurementId }: Props) {
  const fb = safeFbPixelId(fbPixelId);
  const ga = safeGa4Id(ga4MeasurementId);
  if (!fb && !ga) return null;

  return (
    <>
      {fb && (
        <>
          <Script id="fb-pixel" strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${fb}');
fbq('track', 'PageView');`}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: 'none' }}
              alt=""
              src={`https://www.facebook.com/tr?id=${fb}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      )}
      {ga && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${ga}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${ga}', { anonymize_ip: true });`}
          </Script>
        </>
      )}
    </>
  );
}
