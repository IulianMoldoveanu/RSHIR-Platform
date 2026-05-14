// Termenii și Condițiile B2B — pagina /terms.
// Render via LegalShell pe baza conținutului din `@/content/legal/terms`.
// Conținutul juridic se modifică DOAR în terms.ts; aceasta pagină rămâne stabilă.
import type { Metadata } from 'next';
import { tenantBaseUrl } from '@/lib/tenant';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import { LegalShell } from '@/components/legal/LegalShell';
import {
  TERMS_RO,
  TERMS_EN,
  TERMS_LAST_UPDATED,
  TERMS_VERSION,
} from '@/content/legal/terms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = getLocale();
  const url = `${tenantBaseUrl()}/terms`;
  const title = t(locale, 'terms.title');
  const description = t(locale, 'terms.meta_description');
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
      type: 'website',
      locale: locale === 'en' ? 'en_US' : 'ro_RO',
      url,
    },
    twitter: { card: 'summary', title, description },
    robots: { index: true, follow: true },
  };
}

export default async function TermsPage() {
  const locale = getLocale();
  const isEn = locale === 'en';
  const sections = isEn ? TERMS_EN : TERMS_RO;
  const headerNote = isEn
    ? 'This English text is an informational summary. The authoritative Romanian version applies in case of any discrepancy.'
    : 'Documentul aplicabil între HIR și Restaurant-Tenant. Pentru raportul Consumator ↔ Restaurant via Storefront, vezi /terms/storefront.';

  return (
    <LegalShell
      locale={isEn ? 'en' : 'ro'}
      title={t(locale, 'terms.title')}
      subtitle={isEn ? 'B2B Agreement — Restaurant Platform' : 'Contract B2B — Platforma pentru Restaurante'}
      lastUpdated={TERMS_LAST_UPDATED}
      version={TERMS_VERSION}
      sections={sections}
      headerNote={headerNote}
    />
  );
}
