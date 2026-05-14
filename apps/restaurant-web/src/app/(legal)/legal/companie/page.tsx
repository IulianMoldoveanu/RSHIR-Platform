// /legal/companie — public legal entity & contact information.
import type { Metadata } from 'next';
import { tenantBaseUrl } from '@/lib/tenant';
import { getLocale } from '@/lib/i18n/server';
import { LegalShell } from '@/components/legal/LegalShell';
import {
  COMPANY_RO,
  COMPANY_LAST_UPDATED,
  COMPANY_VERSION,
} from '@/content/legal/companie';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = getLocale();
  const url = `${tenantBaseUrl()}/legal/companie`;
  const title = locale === 'en' ? 'Company & legal details' : 'Companie și date legale';
  const description =
    locale === 'en'
      ? 'Legal entity behind HIR — CUI, ONRC, EUID, contact channels, regulatory references.'
      : 'Entitatea juridică a HIR — CUI, ONRC, EUID, canale de contact, referințe regulatorii.';
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: { 'ro-RO': url, en: url, 'x-default': url },
    },
  };
}

export default async function CompanyPage() {
  const locale = getLocale();
  const isEn = locale === 'en';
  return (
    <LegalShell
      locale={isEn ? 'en' : 'ro'}
      title={isEn ? 'Company & legal details' : 'Companie și date legale'}
      subtitle={
        isEn
          ? 'Public information about the legal entity operating HIR.'
          : 'Informații publice despre persoana juridică ce operează HIR.'
      }
      lastUpdated={COMPANY_LAST_UPDATED}
      version={COMPANY_VERSION}
      sections={COMPANY_RO}
    />
  );
}
