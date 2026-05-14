// /legal/utilizare-acceptabila — Acceptable Use Policy (AUP).
import type { Metadata } from 'next';
import { tenantBaseUrl } from '@/lib/tenant';
import { getLocale } from '@/lib/i18n/server';
import { LegalShell } from '@/components/legal/LegalShell';
import {
  AUP_RO,
  AUP_LAST_UPDATED,
  AUP_VERSION,
} from '@/content/legal/utilizare-acceptabila';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = getLocale();
  const url = `${tenantBaseUrl()}/legal/utilizare-acceptabila`;
  const title = locale === 'en' ? 'Acceptable Use Policy' : 'Politica de Utilizare Acceptabilă';
  const description =
    locale === 'en'
      ? 'Conduct rules for restaurants, couriers, and consumers using the HIR platform. Enforcement, appeal, and reporting.'
      : 'Reguli de conduită pentru Restaurante, Curieri și Consumatori pe Platforma HIR. Măsuri, apel, raportare.';
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: { 'ro-RO': url, en: url, 'x-default': url },
    },
  };
}

export default async function AupPage() {
  const locale = getLocale();
  const isEn = locale === 'en';
  return (
    <LegalShell
      locale={isEn ? 'en' : 'ro'}
      title={isEn ? 'Acceptable Use Policy' : 'Politica de Utilizare Acceptabilă'}
      subtitle={
        isEn
          ? 'Conduct rules, prohibited behaviour, enforcement and appeal.'
          : 'Reguli de conduită, comportamente interzise, măsuri și procedura de apel.'
      }
      lastUpdated={AUP_LAST_UPDATED}
      version={AUP_VERSION}
      sections={AUP_RO}
      headerNote={
        isEn
          ? 'Complements /terms, /terms/storefront and DSA reporting flows. Romanian is authoritative.'
          : 'Completează /terms, /terms/storefront și fluxurile de raportare conform DSA. Versiunea autoritativă este textul RO.'
      }
    />
  );
}
