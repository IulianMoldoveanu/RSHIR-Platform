import type { Metadata } from 'next';
import { resolveTenantFromHost, tenantBaseUrl } from '@/lib/tenant';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import {
  COOKIES_CATALOG,
  pickLifetime,
  pickPurpose,
  type CatalogEntry,
} from '@/lib/cookies-catalog';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = getLocale();
  const url = `${tenantBaseUrl()}/privacy`;
  return {
    title: t(locale, 'privacy.title'),
    alternates: {
      canonical: url,
      languages: { 'ro-RO': url, en: url, 'x-default': url },
    },
  };
}

// DPO contact is env-driven so the legal page reflects whatever address the
// operator publishes; default keeps the page usable in dev/preview without
// asserting an address we don't own.
const DPO_EMAIL = process.env.NEXT_PUBLIC_DPO_EMAIL || 'privacy@example.com';
const LAST_UPDATED = '2026-04-28';

function readContactEmail(settings: unknown): string | null {
  if (settings && typeof settings === 'object') {
    const email = (settings as Record<string, unknown>).contact_email;
    if (typeof email === 'string' && email.length > 0) return email;
  }
  return null;
}

export default async function PrivacyPage() {
  const { tenant } = await resolveTenantFromHost();
  const locale = getLocale();
  const tenantName = tenant?.name ?? 'HIR Restaurant';
  const tenantEmail = tenant ? readContactEmail(tenant.settings) ?? DPO_EMAIL : DPO_EMAIL;

  const essential = COOKIES_CATALOG.filter((c) => c.category === 'essential');
  const analytics = COOKIES_CATALOG.filter((c) => c.category === 'analytics');

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-zinc-800">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        {t(locale, 'privacy.title')}
      </h1>
      <p className="mt-1 text-xs text-zinc-500">
        {t(locale, 'privacy.last_updated_template', { date: LAST_UPDATED })}
      </p>

      <Section title={t(locale, 'privacy.operator_title')}>
        <p>
          {t(locale, 'privacy.operator_body_template', { tenant: tenantName })}
        </p>
      </Section>

      <Section title={t(locale, 'privacy.data_collected_title')}>
        <p>{t(locale, 'privacy.data_collected_body')}</p>
      </Section>

      <Section title={t(locale, 'privacy.retention_title')}>
        <p>{t(locale, 'privacy.retention_body')}</p>
      </Section>

      <Section title={t(locale, 'privacy.rights_title')}>
        <p>{t(locale, 'privacy.rights_body')}</p>
      </Section>

      <Section title={t(locale, 'privacy.cookies_title')}>
        <CookieTable entries={essential} locale={locale} />
        <h3 className="mt-6 text-sm font-medium text-zinc-700">Analytics</h3>
        <CookieTable entries={analytics} locale={locale} />
        <p className="mt-2 text-xs text-zinc-500">
          {t(locale, 'privacy.cookies_planned_note')}
        </p>
      </Section>

      <Section title={t(locale, 'privacy.dsr_title')}>
        <p>{t(locale, 'privacy.dsr_body')}</p>
      </Section>

      <Section title={t(locale, 'privacy.contact_title')}>
        <p>
          {t(locale, 'privacy.contact_body_template', {
            tenantEmail,
            dpoEmail: DPO_EMAIL,
          })}
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-zinc-700">{children}</div>
    </section>
  );
}

function CookieTable({
  entries,
  locale,
}: {
  entries: readonly CatalogEntry[];
  locale: 'ro' | 'en';
}) {
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
