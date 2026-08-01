import { t, type Locale } from '@/lib/i18n';
import { MARKETING_CLIENTS } from '@/lib/marketing/clients';

// Static "who we work with" strip — see lib/marketing/clients.ts for why
// this isn't a DB query: the 4 signed clients don't have tenant rows yet.
// Was a live query against v_tenants_storefront (ACTIVE tenants with a
// logo), gated to render only at ≥3 qualifying logos — with 2 real ones on
// the platform today, it was invisible on prod. A curated list that's
// always accurate beats a query that's usually empty.

export function ClientLogos({ currentLocale }: { currentLocale: Locale }) {
  return (
    <section className="border-b border-[#E2E8F0] bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="text-center text-xs font-medium uppercase tracking-wider text-[#94A3B8]">
          {t(currentLocale, 'marketing.home.logos_title')}
        </p>
        {/* Decorative, not a link — matches the reference (Boost Eat's own
            "we work with restaurants" row isn't clickable either). The nav's
            "Clienți" entry is the real path to the full /clienti page. */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
          {MARKETING_CLIENTS.map((client) => (
            <span
              key={client.slug}
              className="text-base font-semibold tracking-tight text-[#334155] opacity-70 transition-opacity hover:opacity-100"
            >
              {client.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
