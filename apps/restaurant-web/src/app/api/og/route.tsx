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

import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

export const runtime = 'edge';

// Cap the strings so a malicious crawler can't make us render 50 KB SVG.
function clamp(raw: string | null, max: number): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
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
          fontFamily: 'sans-serif',
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
          <div style={{ fontWeight: 600, color: accent }}>3 RON / livrare · zero comision</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        // Public: PNG output is identical for identical query strings.
        // 1h browser, 1d CDN, 7d stale — covers crawler re-fetches without
        // making cache invalidation hard when we tweak the template.
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    },
  );
}
