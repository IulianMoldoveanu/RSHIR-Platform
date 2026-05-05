// Lane SEO+ (2026-05-05) — dynamic Open Graph image for marketing routes.
//
// Renders a 1200x630 SVG-styled card via next/og's edge ImageResponse.
// Each marketing page passes `?title=` + optional `?subtitle=` + optional
// `?variant=` so social previews stay on-brand without us hand-rolling
// PNGs. Cached aggressively at the CDN edge — title/subtitle changes on
// merge; variant is a small enum.
//
// Lane Q already shipped sitemap + Organization/WebSite/BreadcrumbList
// JSON-LD on the canonical host. This route closes the social-preview gap
// for /, /pricing, /features, /affiliate, /parteneriat/inscriere,
// /case-studies/foisorul-a, /migrate-from-gloriafood, /contact.
//
// We intentionally accept arbitrary `title` strings up to 120 chars and
// truncate — better to render a slightly-cropped headline than 500 the
// crawler. No tenant data is rendered here; tenant storefronts use their
// own cover image (see (storefront)/page.tsx generateMetadata).
//
// Lane FIX-P1 (2026-05-05) — initial deploy returned `200 image/png` with
// `Content-Length: 0` because the default next/og font does NOT cover
// Romanian Latin Extended-A glyphs (ă/â/î/ș/ț) or Unicode punctuation
// (`…`, `·`); Satori swallows the missing-glyph error and emits zero bytes.
// Fix: (1) fetch Inter TTF (covers RO diacritics + general Latin) at
// request time, cache via SWR-style edge cache; (2) replace Unicode
// punctuation with ASCII fallbacks; (3) wrap render in try/catch with a
// minimal SVG fallback so we never serve empty PNG again.

import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

export const runtime = 'edge';

// Cap the strings so a malicious crawler can't make us render 50 KB SVG.
// ASCII `...` instead of Unicode `…` so the truncation marker renders even
// when the font is missing extended punctuation glyphs.
function clamp(raw: string | null, max: number): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.length > max ? `${trimmed.slice(0, max - 3)}...` : trimmed;
}

// Inter Regular + Bold from a stable Google Fonts mirror (jsdelivr serves
// the upstream npm @fontsource package over a CDN that's edge-friendly and
// doesn't 404 on us like the gstatic versioned URLs do).
const FONT_REGULAR_URL =
  'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-ext-400-normal.woff';
const FONT_BOLD_URL =
  'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-ext-700-normal.woff';

// Module-level cache so repeated cold starts on the same edge instance
// reuse the font binary instead of re-downloading.
let cachedFonts: Promise<Array<{ name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }>> | null = null;

async function loadFonts() {
  if (cachedFonts) return cachedFonts;
  cachedFonts = (async () => {
    const [reg, bold] = await Promise.all([
      fetch(FONT_REGULAR_URL).then((r) => {
        if (!r.ok) throw new Error(`font regular ${r.status}`);
        return r.arrayBuffer();
      }),
      fetch(FONT_BOLD_URL).then((r) => {
        if (!r.ok) throw new Error(`font bold ${r.status}`);
        return r.arrayBuffer();
      }),
    ]);
    return [
      { name: 'Inter', data: reg, weight: 400 as const, style: 'normal' as const },
      { name: 'Inter', data: bold, weight: 700 as const, style: 'normal' as const },
    ];
  })().catch((err) => {
    // Reset cache on failure so the next request retries instead of
    // permanently serving the fallback.
    cachedFonts = null;
    throw err;
  });
  return cachedFonts;
}

type Variant = 'default' | 'pricing' | 'case-study' | 'partner' | 'migrate';

function paletteFor(variant: Variant): { bg: string; accent: string; pillBg: string; pillFg: string } {
  switch (variant) {
    case 'pricing':
      return { bg: '#0F172A', accent: '#A78BFA', pillBg: '#1E1B4B', pillFg: '#C4B5FD' };
    case 'case-study':
      return { bg: '#FAFAFA', accent: '#4F46E5', pillBg: '#EEF2FF', pillFg: '#4F46E5' };
    case 'partner':
      return { bg: '#FAFAFA', accent: '#0F172A', pillBg: '#ECFDF5', pillFg: '#047857' };
    case 'migrate':
      return { bg: '#0F172A', accent: '#FCD34D', pillBg: '#78350F', pillFg: '#FCD34D' };
    case 'default':
    default:
      return { bg: '#FAFAFA', accent: '#0F172A', pillBg: '#EEF2FF', pillFg: '#4F46E5' };
  }
}

function variantLabel(variant: Variant): string {
  switch (variant) {
    case 'pricing': return 'Tarife';
    case 'case-study': return 'Studiu de caz';
    case 'partner': return 'Partener';
    case 'migrate': return 'Migrare';
    case 'default':
    default: return 'HIR Restaurant Suite';
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const title = clamp(searchParams.get('title'), 120) || 'HIR Restaurant Suite';
  const subtitle = clamp(searchParams.get('subtitle'), 160);
  const rawVariant = (searchParams.get('variant') ?? 'default').toLowerCase();
  const variant: Variant = (
    ['default', 'pricing', 'case-study', 'partner', 'migrate'].includes(rawVariant)
      ? rawVariant
      : 'default'
  ) as Variant;

  const { bg, accent, pillBg, pillFg } = paletteFor(variant);
  const isDark = variant === 'pricing' || variant === 'migrate';
  const titleColor = isDark ? '#F8FAFC' : '#0F172A';
  const subtitleColor = isDark ? '#CBD5E1' : '#475569';

  let fonts: Awaited<ReturnType<typeof loadFonts>> | undefined;
  try {
    fonts = await loadFonts();
  } catch (err) {
    // Don't fail the request — fall through to ImageResponse without a
    // custom font. next/og will use its default font; RO diacritics may
    // render as squares, but we serve a non-empty PNG instead of zero
    // bytes. Logged so we can spot CDN regressions in Vercel runtime logs.
    console.error('[og] font load failed:', (err as Error)?.message);
  }

  try {
    return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: bg,
          fontFamily: fonts ? 'Inter, sans-serif' : 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: accent,
              color: isDark ? '#0F172A' : '#FFFFFF',
              fontSize: '28px',
              fontWeight: 700,
            }}
          >
            H
          </div>
          <div
            style={{
              fontSize: '22px',
              fontWeight: 600,
              color: titleColor,
              letterSpacing: '-0.01em',
            }}
          >
            HIR Restaurant Suite
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignSelf: 'flex-start',
              padding: '6px 14px',
              borderRadius: '8px',
              background: pillBg,
              color: pillFg,
              fontSize: '18px',
              fontWeight: 600,
              letterSpacing: '0.02em',
            }}
          >
            {variantLabel(variant)}
          </div>
          <div
            style={{
              fontSize: title.length > 60 ? '54px' : '64px',
              fontWeight: 700,
              color: titleColor,
              lineHeight: 1.1,
              letterSpacing: '-0.025em',
              maxWidth: '1040px',
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: '26px',
                color: subtitleColor,
                lineHeight: 1.35,
                maxWidth: '960px',
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '20px',
            color: subtitleColor,
          }}
        >
          <div>hiraisolutions.ro</div>
          <div style={{ fontWeight: 600, color: accent }}>3 RON / livrare - zero comision</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      ...(fonts ? { fonts } : {}),
      headers: {
        // Public: PNG output is identical for identical query strings.
        // 1h browser, 1d CDN, 7d stale — covers crawler re-fetches without
        // making cache invalidation hard when we tweak the template.
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    },
  );
  } catch (err) {
    // If Satori still throws (unsupported style, OOM, etc.), serve a tiny
    // SVG-as-PNG fallback so callers never see an empty body. We return
    // 200 with a short cache so a transient failure auto-recovers on the
    // next deploy without poisoning the CDN.
    console.error('[og] render failed:', (err as Error)?.message);
    const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#0F172A"/><text x="600" y="315" font-family="sans-serif" font-size="48" font-weight="700" fill="#F8FAFC" text-anchor="middle" dominant-baseline="middle">HIR Restaurant Suite</text></svg>`;
    return new Response(fallbackSvg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    });
  }
}
