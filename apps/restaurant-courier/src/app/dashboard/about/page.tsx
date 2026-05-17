import Link from 'next/link';
import { ChevronLeft, Eraser, ExternalLink, Heart, Info, Package } from 'lucide-react';
import { CURRENT_RELEASE } from '@/lib/whats-new';
import { ClearLocalDataButton } from '@/components/clear-local-data-button';
import { cardClasses } from '@/components/card';

export const dynamic = 'force-static';

const APP_VERSION = '0.1.0';

export const metadata = {
  title: 'Despre — HIR Curier',
};

/**
 * Static about page. Surfaces:
 *   - App version + latest release notes
 *   - Open-source libraries powering the app (transparency)
 *   - Contact channels
 *
 * Reachable from Setări → About. Pure server-rendered, no auth check
 * because the content is non-sensitive (libraries + version), and the
 * page falls inside /dashboard which the layout already gates.
 */

const LIBRARIES: Array<{ name: string; purpose: string; url: string }> = [
  { name: 'Next.js', purpose: 'Framework aplicație', url: 'https://nextjs.org' },
  { name: 'React', purpose: 'Bibliotecă UI', url: 'https://react.dev' },
  { name: 'Supabase', purpose: 'Backend & realtime', url: 'https://supabase.com' },
  { name: 'Leaflet', purpose: 'Hartă interactivă', url: 'https://leafletjs.com' },
  { name: 'OpenStreetMap', purpose: 'Date hartă', url: 'https://www.openstreetmap.org' },
  { name: 'lucide-react', purpose: 'Iconițe', url: 'https://lucide.dev' },
  { name: 'Tailwind CSS', purpose: 'Stilizare', url: 'https://tailwindcss.com' },
  { name: 'Sentry', purpose: 'Monitorizare erori', url: 'https://sentry.io' },
  { name: 'Open-Meteo', purpose: 'Vreme', url: 'https://open-meteo.com' },
];

export default function AboutPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Link
        href="/dashboard/settings"
        className="inline-flex min-h-[32px] items-center gap-1.5 self-start rounded-lg px-1 text-xs font-medium text-hir-muted-fg transition-colors hover:text-hir-fg focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        Setări
      </Link>

      <header className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-500/30">
          <Info className="h-5 w-5 text-violet-300" aria-hidden />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-hir-fg">
            Despre HIR Curier
          </h1>
          <p className="mt-0.5 text-sm leading-relaxed text-hir-muted-fg">
            Aplicația operațională a curierului HIR — comenzi, ture, câștiguri.
          </p>
        </div>
      </header>

      {/* Version + last release */}
      <section className={cardClasses({ padding: 'lg' })}>
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-500/30"
          >
            <Package className="h-5 w-5 text-violet-300" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-hir-fg">HIR Curier</p>
            <p className="mt-0.5 text-xs text-hir-muted-fg">
              <span className="tabular-nums">Versiunea {APP_VERSION}</span>
              <span className="mx-1.5 text-hir-muted-fg/60">·</span>
              <span>ultima actualizare {CURRENT_RELEASE.date}</span>
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-hir-border bg-hir-bg p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet-300">
            {CURRENT_RELEASE.title}
          </p>
          <ul className="space-y-1.5 text-xs leading-relaxed text-hir-muted-fg">
            {CURRENT_RELEASE.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-400"
                />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* OSS credits */}
      <section className={cardClasses({ padding: 'lg' })}>
        <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
          <Heart className="h-3.5 w-3.5 text-rose-300" aria-hidden />
          Construit cu open source
        </h2>
        <ul className="divide-y divide-hir-border/60">
          {LIBRARIES.map((lib) => (
            <li key={lib.name} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-hir-fg">{lib.name}</p>
                <p className="mt-0.5 text-[11px] text-hir-muted-fg">{lib.purpose}</p>
              </div>
              <a
                href={lib.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Deschide ${lib.name} într-o filă nouă`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-hir-muted-fg transition-colors hover:bg-violet-500/10 hover:text-violet-200 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-hir-muted-fg">
          Mulțumim comunităților din spatele acestor proiecte.
        </p>
      </section>

      {/* Operated by */}
      <section className={cardClasses({ className: 'text-xs leading-relaxed text-hir-muted-fg' })}>
        <p className="mb-1 text-sm font-semibold text-hir-fg">Operator</p>
        <p>
          HIR Platform · administrator infrastructură HIR for You. Suport curieri:{' '}
          <a
            href="mailto:suport@hirforyou.ro"
            className="font-medium text-violet-300 hover:text-violet-200"
          >
            suport@hirforyou.ro
          </a>
          .
        </p>
      </section>

      {/* Local data reset */}
      <section className={cardClasses({ padding: 'lg' })}>
        <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
          <Eraser className="h-3.5 w-3.5 text-rose-300" aria-hidden />
          Date salvate pe acest dispozitiv
        </h2>
        <p className="mb-3 text-xs leading-relaxed text-hir-muted-fg">
          Preferințele tale (notificări, ținte zilnice, documente memorizate,
          sloturi rezervate) sunt salvate doar local pe acest telefon. Le poți
          șterge oricând fără să afecteze contul tău HIR.
        </p>
        <ClearLocalDataButton />
      </section>
    </div>
  );
}
