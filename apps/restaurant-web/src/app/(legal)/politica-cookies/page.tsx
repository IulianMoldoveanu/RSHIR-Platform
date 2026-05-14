// Politica de cookie-uri — pagina /politica-cookies.
// Conținutul juridic vine din `@/content/legal/cookies` și se renderizează
// via LegalShell. Sub conținut afișăm tabelul granular din COOKIES_CATALOG.
import type { Metadata } from 'next';
import { tenantBaseUrl } from '@/lib/tenant';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import { LegalShell } from '@/components/legal/LegalShell';
import {
  COOKIES_CATALOG,
  pickLifetime,
  pickPurpose,
  type CatalogEntry,
} from '@/lib/cookies-catalog';
import {
  COOKIES_RO,
  COOKIES_LAST_UPDATED,
  COOKIES_VERSION,
} from '@/content/legal/cookies';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = getLocale();
  const url = `${tenantBaseUrl()}/politica-cookies`;
  const title = locale === 'en' ? 'Cookies Policy' : 'Politica de cookie-uri';
  const description =
    locale === 'en'
      ? 'How HIR uses cookies and similar technologies. Reject-all has equal prominence to Accept-all.'
      : 'Cum folosim cookie-uri și tehnologii similare. „Refuză tot" are aceeași prominentă ca „Accept tot".';
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: { 'ro-RO': url, en: url, 'x-default': url },
    },
  };
}

export default async function CookiesPage() {
  const locale = getLocale();
  const isEn = locale === 'en';
  const essential = COOKIES_CATALOG.filter((c) => c.category === 'essential');
  const analytics = COOKIES_CATALOG.filter((c) => c.category === 'analytics');

  return (
    <>
      <LegalShell
        locale={isEn ? 'en' : 'ro'}
        title={isEn ? 'Cookies Policy' : 'Politica de cookie-uri'}
        subtitle={
          isEn
            ? 'Cookies & similar technologies — categories, consent, granular list.'
            : 'Cookie-uri și tehnologii similare — categorii, consimțământ, listă granulară.'
        }
        lastUpdated={COOKIES_LAST_UPDATED}
        version={COOKIES_VERSION}
        sections={COOKIES_RO}
      />
      <section className="mx-auto mt-2 max-w-3xl px-4 pb-12">
        <h2 className="text-xl font-semibold text-zinc-900">
          {isEn ? 'Granular table — cookies placed by the HIR platform' : 'Tabel granular — cookie-uri plasate de Platforma HIR'}
        </h2>
        <p className="mt-2 text-sm text-zinc-600">
          {isEn
            ? 'Cookies set by the Restaurant on its own Storefront (e.g. marketing pixels) are listed in the preferences panel of each Storefront.'
            : 'Cookie-urile plasate de Restaurant pe Storefront-ul propriu (de ex. pixeli marketing) sunt listate în panoul de preferințe al fiecărui Storefront.'}
        </p>
        <h3 className="mt-4 text-sm font-medium text-zinc-700">
          {isEn ? 'Strictly necessary' : 'Strict necesare'}
        </h3>
        <CookieTable entries={essential} locale={locale} />
        <h3 className="mt-6 text-sm font-medium text-zinc-700">
          {isEn ? 'Analytics' : 'Analitice'}
        </h3>
        <CookieTable entries={analytics} locale={locale} />
        <p className="mt-3 text-xs text-zinc-500">
          {t(locale, 'privacy.cookies_planned_note')}
        </p>
      </section>
    </>
  );
}

function CookieTable({ entries, locale }: { entries: readonly CatalogEntry[]; locale: 'ro' | 'en' }) {
  if (entries.length === 0) return null;
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200">
      <table className="w-full text-left text-xs">
        <thead className="bg-zinc-50 text-zinc-600">
          <tr>
            <th className="px-3 py-2 font-medium">{t(locale, 'privacy.cookies_name')}</th>
            <th className="px-3 py-2 font-medium">{t(locale, 'privacy.cookies_purpose')}</th>
            <th className="px-3 py-2 font-medium">{t(locale, 'privacy.cookies_lifetime')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.name} className="border-t border-zinc-200">
              <td className="px-3 py-2 font-mono text-[11px] text-zinc-800">{entry.name}</td>
              <td className="px-3 py-2 text-zinc-700">{pickPurpose(entry, locale)}</td>
              <td className="px-3 py-2 text-zinc-700">{pickLifetime(entry, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
