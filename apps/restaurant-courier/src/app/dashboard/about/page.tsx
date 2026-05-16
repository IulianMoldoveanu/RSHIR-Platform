import Link from 'next/link';
import { ChevronLeft, ExternalLink, Heart, Info, Package } from 'lucide-react';
import { CURRENT_RELEASE } from '@/lib/whats-new';

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
        className="flex min-h-[44px] items-center gap-1 self-start text-sm text-hir-muted-fg hover:text-hir-fg"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Setări
      </Link>

      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold text-hir-fg">
          <Info className="h-5 w-5 text-violet-400" aria-hidden />
          Despre HIR Curier
        </h1>
        <p className="mt-1 text-sm text-hir-muted-fg">
          Aplicația operațională a curierului HIR — comenzi, ture, câștiguri.
        </p>
      </header>

      {/* Version + last release */}
      <section className="rounded-2xl border border-hir-border bg-hir-surface p-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15"
          >
            <Package className="h-5 w-5 text-violet-300" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-hir-fg">HIR Curier</p>
            <p className="text-xs text-hir-muted-fg">
              Versiunea {APP_VERSION} · ultima actualizare {CURRENT_RELEASE.date}
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-hir-border bg-hir-bg p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-hir-muted-fg">
            {CURRENT_RELEASE.title}
          </p>
          <ul className="ml-1 list-disc space-y-1 pl-5 text-xs text-hir-muted-fg">
            {CURRENT_RELEASE.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* OSS credits */}
      <section className="rounded-2xl border border-hir-border bg-hir-surface p-4">
        <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-hir-muted-fg">
          <Heart className="h-3.5 w-3.5 text-rose-300" aria-hidden />
          Construit cu open source
        </h2>
        <ul className="divide-y divide-hir-border/60">
          {LIBRARIES.map((lib) => (
            <li key={lib.name} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-hir-fg">{lib.name}</p>
                <p className="text-[11px] text-hir-muted-fg">{lib.purpose}</p>
              </div>
              <a
                href={lib.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Deschide ${lib.name} într-o filă nouă`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-hir-muted-fg hover:bg-hir-border/40 hover:text-hir-fg"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-hir-muted-fg">
          Mulțumim comunităților din spatele acestor proiecte.
        </p>
      </section>

      {/* Operated by */}
      <section className="rounded-2xl border border-hir-border bg-hir-surface p-4 text-xs text-hir-muted-fg">
        <p className="mb-1 font-semibold text-hir-fg">Operator</p>
        <p>
          HIR Platform · administrator infrastructură HIR for You.
          Suport curieri:{' '}
          <a
            href="mailto:suport@hirforyou.ro"
            className="text-violet-300 hover:text-violet-200"
          >
            suport@hirforyou.ro
          </a>
          .
        </p>
      </section>
    </div>
  );
}
