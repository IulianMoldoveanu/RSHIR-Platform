// /legal/dpa — Data Processing Agreement HIR (processor) ↔ Restaurant (controller).
import type { Metadata } from 'next';
import { tenantBaseUrl } from '@/lib/tenant';
import { getLocale } from '@/lib/i18n/server';
import { LegalShell } from '@/components/legal/LegalShell';
import { DPA_RO, DPA_LAST_UPDATED, DPA_VERSION } from '@/content/legal/dpa';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = getLocale();
  const url = `${tenantBaseUrl()}/legal/dpa`;
  const title =
    locale === 'en'
      ? 'Data Processing Agreement (DPA)'
      : 'Acord de Prelucrare a Datelor (DPA)';
  const description =
    locale === 'en'
      ? 'GDPR Article 28 contract between HIR (processor) and the Restaurant-Tenant (controller).'
      : 'Contract conform art. 28 RGPD între HIR (persoană împuternicită) și Restaurant-Tenant (operator).';
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: { 'ro-RO': url, en: url, 'x-default': url },
    },
  };
}

export default async function DpaPage() {
  const locale = getLocale();
  const isEn = locale === 'en';
  return (
    <LegalShell
      locale={isEn ? 'en' : 'ro'}
      title={isEn ? 'Data Processing Agreement (DPA)' : 'Acord de Prelucrare a Datelor (DPA)'}
      subtitle={
        isEn
          ? 'Article 28 GDPR — HIR as processor for the Restaurant-Tenant.'
          : 'Art. 28 RGPD — HIR ca persoană împuternicită pentru Restaurant.'
      }
      lastUpdated={DPA_LAST_UPDATED}
      version={DPA_VERSION}
      sections={DPA_RO}
      headerNote={
        isEn
          ? 'Part of the B2B contract — see /terms. The authoritative Romanian version applies.'
          : 'Anexă a contractului B2B — vezi /terms. Versiunea autoritativă este textul RO.'
      }
    />
  );
}
