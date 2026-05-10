// Lane PRESENTATION (2026-05-06) — `/poveste` brand-presentation landing.
//
// Optional, opt-in page per tenant. Off by default — `presentation_enabled`
// in `settings` JSONB must be `true`. Tenants who only want a landing page
// (no shop) can leave the storefront menu empty and link customers here;
// tenants with an active shop get a brand-story page that complements the
// menu (CTA at the bottom links back to the shop).
//
// Host-tenant scoped (resolveTenantFromHost), ISR with 600s revalidate.

import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import {
  ArrowRight,
  Facebook,
  Instagram,
  PlaySquare,
  Youtube,
} from 'lucide-react';
import { PresentationMarkdown } from '@/components/storefront/presentation-markdown';
import { PresentationGallery } from '@/components/storefront/presentation-gallery';
import {
  brandingFor,
  getPresentationConfig,
  resolveTenantFromHost,
  themeFor,
  type TenantSettings,
} from '@/lib/tenant';
import { safeJsonLd } from '@/lib/jsonld';
import { canonicalBaseUrl } from '@/lib/seo-marketing';

// The (storefront) layout is `force-dynamic` (it reads cookies + tenant
// from headers), which makes Next render the route dynamically anyway.
// We still set `revalidate = 600` as a hint for any segment-level fetch
// caches; it's a no-op for header-driven dynamic rendering.
export const revalidate = 600;

export async function generateMetadata(): Promise<Metadata> {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return { robots: { index: false, follow: false } };
  const config = getPresentationConfig(tenant.settings as TenantSettings);
  if (!config.enabled) return { robots: { index: false, follow: false } };

  const title = `${tenant.name} · Povestea noastră`;
  const description =
    (tenant.settings as TenantSettings).about_short ||
    (config.aboutLong ? config.aboutLong.slice(0, 200) : `Povestea ${tenant.name} pe HIR.`);
  const host =
    (await headers()).get('x-hir-host') ?? (await headers()).get('host')?.split(':')[0] ?? '';
  const url = `${canonicalBaseUrl(host)}/poveste`;
  const { coverUrl } = brandingFor(tenant.settings as TenantSettings);

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: { 'ro-RO': url, en: url, 'x-default': url },
    },
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      locale: 'ro_RO',
      images: coverUrl ? [{ url: coverUrl, width: 1200, height: 630, alt: tenant.name }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: coverUrl ? [coverUrl] : undefined,
    },
    robots: { index: true, follow: true },
  };
}

// Parse a YouTube / Vimeo URL into a same-origin embed URL. Returns null
// for anything that isn't a recognized share/watch link so we never embed
// arbitrary content.
function videoEmbedSrc(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = u.searchParams.get('v');
      if (id && /^[\w-]{6,}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
      if (u.pathname.startsWith('/embed/')) {
        const id2 = u.pathname.slice('/embed/'.length).split('/')[0];
        if (/^[\w-]{6,}$/.test(id2)) return `https://www.youtube-nocookie.com/embed/${id2}`;
      }
    }
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      if (/^[\w-]{6,}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.slice(1).split('/')[0];
      if (/^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
    if (host === 'player.vimeo.com') {
      // already an embed URL
      return u.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export default async function PovestePage() {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) notFound();

  const settings = tenant.settings as TenantSettings;
  const config = getPresentationConfig(settings);
  if (!config.enabled) notFound();

  const { coverUrl, logoUrl } = brandingFor(settings);
  const theme = themeFor(settings, tenant.template_slug);
  const tagline = settings.tagline?.trim() || null;
  const aboutShort = settings.about_short?.trim() || null;
  const videoSrc = config.videoUrl ? videoEmbedSrc(config.videoUrl) : null;
  const aboutSource = config.aboutLong ?? aboutShort ?? null;

  const restaurantJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: tenant.name,
    image: coverUrl ?? logoUrl ?? undefined,
    description: aboutShort ?? (config.aboutLong ? config.aboutLong.slice(0, 200) : undefined),
  };

  const showSocials =
    !!config.socials.instagram ||
    !!config.socials.facebook ||
    !!config.socials.tiktok ||
    !!config.socials.youtube;

  return (
    <main
      className="min-h-screen bg-white pb-16"
      style={{ fontFamily: 'var(--hir-font-body, var(--font-sans))' }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(restaurantJsonLd) }}
      />
      {/* HERO */}
      <section className="relative">
        <div
          className="relative h-56 w-full overflow-hidden sm:h-80 md:h-[420px]"
          style={{
            background: coverUrl
              ? '#0f172a'
              : 'linear-gradient(135deg, color-mix(in srgb, var(--hir-brand,#7c3aed) 30%, transparent) 0%, color-mix(in srgb, var(--hir-brand,#7c3aed) 10%, transparent) 70%, transparent 100%)',
          }}
        >
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            (<img
              src={coverUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />)
          ) : null}
          {coverUrl ? (
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(to bottom, rgba(15,23,42,0.10) 0%, rgba(15,23,42,0.55) 100%)',
              }}
            />
          ) : null}
        </div>

        <div className="mx-auto -mt-16 max-w-3xl px-4 sm:-mt-20 sm:px-6">
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-zinc-100 sm:p-8">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              (<img
                src={logoUrl}
                alt={tenant.name}
                width={96}
                height={96}
                className="h-20 w-20 rounded-2xl object-cover ring-1 ring-zinc-200 sm:h-24 sm:w-24"
                loading="eager"
                decoding="async"
              />)
            ) : (
              <div
                className="flex h-20 w-20 items-center justify-center rounded-2xl text-2xl font-semibold text-white sm:h-24 sm:w-24"
                style={{ backgroundColor: theme.brandColor }}
                aria-hidden="true"
              >
                {tenant.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <h1
              className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl md:text-4xl"
              style={{ fontFamily: 'var(--hir-font-heading, var(--font-sans))' }}
            >
              {tenant.name}
            </h1>
            {tagline ? (
              <p className="max-w-xl text-base text-zinc-600 sm:text-lg">{tagline}</p>
            ) : null}
            <Link
              href="/"
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--hir-brand,#7c3aed)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--hir-brand,#7c3aed)] focus:ring-offset-2"
            >
              Comandă acum
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>
      {/* DESPRE NOI */}
      <section className="mx-auto mt-12 max-w-2xl px-4 sm:mt-16 sm:px-6">
        <h2
          className="mb-4 text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl"
          style={{ fontFamily: 'var(--hir-font-heading, var(--font-sans))' }}
        >
          Despre noi
        </h2>
        {aboutSource ? (
          <PresentationMarkdown source={aboutSource} />
        ) : (
          <p className="text-[15px] leading-relaxed text-zinc-500">
            Această secțiune va fi completată curând.
          </p>
        )}
      </section>
      {/* GALERIE */}
      {config.gallery.length > 0 ? (
        <section className="mx-auto mt-14 max-w-5xl px-4 sm:mt-20 sm:px-6">
          <h2
            className="mb-5 text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl"
            style={{ fontFamily: 'var(--hir-font-heading, var(--font-sans))' }}
          >
            Galerie
          </h2>
          <PresentationGallery items={config.gallery} />
        </section>
      ) : null}
      {/* ECHIPA */}
      {config.team.length > 0 ? (
        <section className="mx-auto mt-14 max-w-4xl px-4 sm:mt-20 sm:px-6">
          <h2
            className="mb-5 text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl"
            style={{ fontFamily: 'var(--hir-font-heading, var(--font-sans))' }}
          >
            Echipa noastră
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {config.team.map((member, i) => (
              <li
                key={`${member.name}-${i}`}
                className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-5 text-center"
              >
                {member.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  (<img
                    src={member.photo_url}
                    alt={member.name}
                    width={96}
                    height={96}
                    className="h-20 w-20 rounded-full object-cover ring-1 ring-zinc-200"
                    loading="lazy"
                    decoding="async"
                  />)
                ) : (
                  <div
                    className="flex h-20 w-20 items-center justify-center rounded-full text-lg font-semibold text-white"
                    style={{ backgroundColor: theme.brandColor }}
                    aria-hidden="true"
                  >
                    {member.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900">{member.name}</p>
                  {member.role ? (
                    <p className="mt-0.5 text-xs text-zinc-600">{member.role}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {/* VIDEO */}
      {videoSrc ? (
        <section className="mx-auto mt-14 max-w-4xl px-4 sm:mt-20 sm:px-6">
          <h2
            className="mb-5 text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl"
            style={{ fontFamily: 'var(--hir-font-heading, var(--font-sans))' }}
          >
            Vezi-ne în acțiune
          </h2>
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black ring-1 ring-zinc-200">
            <iframe
              src={videoSrc}
              title={`Video ${tenant.name}`}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </div>
        </section>
      ) : null}
      {/* SOCIAL */}
      {showSocials ? (
        <section className="mx-auto mt-14 max-w-3xl px-4 text-center sm:mt-20 sm:px-6">
          <h2
            className="mb-5 text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl"
            style={{ fontFamily: 'var(--hir-font-heading, var(--font-sans))' }}
          >
            Urmărește-ne
          </h2>
          <ul className="flex flex-wrap items-center justify-center gap-3">
            {config.socials.instagram ? (
              <li>
                <a
                  href={config.socials.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="group inline-flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 transition-colors hover:bg-[var(--hir-brand,#7c3aed)] hover:text-white focus:outline-none focus:ring-2 focus:ring-[var(--hir-brand,#7c3aed)] focus:ring-offset-2"
                >
                  <Instagram className="h-5 w-5" aria-hidden />
                </a>
              </li>
            ) : null}
            {config.socials.facebook ? (
              <li>
                <a
                  href={config.socials.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook"
                  className="group inline-flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 transition-colors hover:bg-[var(--hir-brand,#7c3aed)] hover:text-white focus:outline-none focus:ring-2 focus:ring-[var(--hir-brand,#7c3aed)] focus:ring-offset-2"
                >
                  <Facebook className="h-5 w-5" aria-hidden />
                </a>
              </li>
            ) : null}
            {config.socials.tiktok ? (
              <li>
                <a
                  href={config.socials.tiktok}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="TikTok"
                  className="group inline-flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 transition-colors hover:bg-[var(--hir-brand,#7c3aed)] hover:text-white focus:outline-none focus:ring-2 focus:ring-[var(--hir-brand,#7c3aed)] focus:ring-offset-2"
                >
                  <PlaySquare className="h-5 w-5" aria-hidden />
                </a>
              </li>
            ) : null}
            {config.socials.youtube ? (
              <li>
                <a
                  href={config.socials.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="YouTube"
                  className="group inline-flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 transition-colors hover:bg-[var(--hir-brand,#7c3aed)] hover:text-white focus:outline-none focus:ring-2 focus:ring-[var(--hir-brand,#7c3aed)] focus:ring-offset-2"
                >
                  <Youtube className="h-5 w-5" aria-hidden />
                </a>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
      {/* FOOTER CTA */}
      <section className="mx-auto mt-16 max-w-3xl px-4 sm:mt-24 sm:px-6">
        <div
          className="flex flex-col items-center gap-3 rounded-2xl px-6 py-10 text-center"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--hir-brand,#7c3aed) 14%, white) 0%, color-mix(in srgb, var(--hir-brand,#7c3aed) 4%, white) 100%)',
          }}
        >
          <h2
            className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl"
            style={{ fontFamily: 'var(--hir-font-heading, var(--font-sans))' }}
          >
            Descoperă meniul nostru
          </h2>
          <p className="max-w-xl text-sm text-zinc-700">
            Comandă online direct de la noi. Livrare rapidă, fără comisioane ascunse.
          </p>
          <Link
            href="/"
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--hir-brand,#7c3aed)] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--hir-brand,#7c3aed)] focus:ring-offset-2"
          >
            Vezi meniul
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </main>
  );
}
