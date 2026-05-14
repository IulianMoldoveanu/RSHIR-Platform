// Politica de Confidențialitate — pagina /privacy.
// Render via LegalShell pe baza conținutului din `@/content/legal/privacy`.
// Lista granulară a cookie-urilor se găsește la /politica-cookies.
import type { Metadata } from 'next';
import { tenantBaseUrl } from '@/lib/tenant';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import { LegalShell } from '@/components/legal/LegalShell';
import {
  PRIVACY_RO,
  PRIVACY_LAST_UPDATED,
  PRIVACY_VERSION,
} from '@/content/legal/privacy';

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

export default async function PrivacyPage() {
  const locale = getLocale();
  const isEn = locale === 'en';

  return (
    <LegalShell
      locale={isEn ? 'en' : 'ro'}
      title={t(locale, 'privacy.title')}
      subtitle={
        isEn
          ? 'How we process personal data, by data-subject category.'
          : 'Modul în care prelucrăm datele personale, organizat pe categorii de persoane vizate.'
      }
      lastUpdated={PRIVACY_LAST_UPDATED}
      version={PRIVACY_VERSION}
      sections={PRIVACY_RO}
      headerNote={
        isEn
          ? 'The authoritative Romanian version applies. For cookie-level detail see /politica-cookies.'
          : 'Pentru lista granulară a cookie-urilor (nume, scop, durată) consultați /politica-cookies.'
      }
    />
  );
}
