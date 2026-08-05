import Link from 'next/link';
import { t, type Locale } from '@/lib/i18n';
import { MARKETING_CLIENTS } from '@/lib/marketing/clients';

// Homepage "who uses HIR" strip — real client logos, self-hosted under
// public/clients/ (see lib/marketing/clients.ts for sources and for why this
// isn't a DB query: the signed clients don't have tenant rows yet).
//
// 2026-08-01 — was a row of plain names; Iulian asked for each business to
// carry its own logo. Shown in full colour: a grayscale filter turned Roata
// Norocului's mark (gold wheel on burgundy) into a grey box that read as a
// broken-image icon, and washed the other three out too.

export function ClientLogos({ currentLocale }: { currentLocale: Locale }) {
  return (
    <section className="border-b border-[#E2E8F0] bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <p className="text-center text-xs font-medium uppercase tracking-wider text-[#94A3B8]">
          {t(currentLocale, 'marketing.home.logos_title')}
        </p>
        <Link
          href="/clienti"
          className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-8 rounded-lg focus-visible:outline-2 focus-visible:outline-[#4F46E5] focus-visible:outline-offset-4"
          aria-label={t(currentLocale, 'marketing.shell.nav_clients')}
        >
          {MARKETING_CLIENTS.map((client) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={client.slug}
              src={client.logo}
              alt={client.name}
              width={480}
              height={200}
              loading="lazy"
              decoding="async"
              className="h-10 w-auto max-w-[150px] object-contain opacity-80 transition-opacity duration-200 hover:opacity-100 sm:h-12 sm:max-w-[170px]"
            />
          ))}
        </Link>
      </div>
    </section>
  );
}
