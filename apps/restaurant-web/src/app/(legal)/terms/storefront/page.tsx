// Termenii Storefront — raportul B2C Consumator ↔ Restaurant, cu HIR ca
// intermediar tehnic. Pagina /terms/storefront, link-ată la checkout pe
// orice Storefront găzduit de HIR.
import type { Metadata } from 'next';
import { tenantBaseUrl } from '@/lib/tenant';
import { getLocale } from '@/lib/i18n/server';
import { LegalShell } from '@/components/legal/LegalShell';
import {
  TERMS_STOREFRONT_RO,
  TERMS_STOREFRONT_EN,
  TERMS_STOREFRONT_LAST_UPDATED,
  TERMS_STOREFRONT_VERSION,
} from '@/content/legal/terms-storefront';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = getLocale();
  const url = `${tenantBaseUrl()}/terms/storefront`;
  const title =
    locale === 'en'
      ? 'Storefront Terms — Consumer ↔ Restaurant'
      : 'Termeni Storefront — Consumator și Restaurant';
  const description =
    locale === 'en'
      ? 'Legal terms for end-customers ordering from a Restaurant via a HIR-hosted online storefront. HIR acts as a technical intermediary under Romanian Law 365/2002.'
      : 'Termenii pentru consumatorii care plasează comenzi prin magazinul online al unui Restaurant găzduit de HIR. HIR este intermediar tehnic conform Legii 365/2002.';

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

export default async function TermsStorefrontPage() {
  const locale = getLocale();
  const isEn = locale === 'en';
  const sections = isEn ? TERMS_STOREFRONT_EN : TERMS_STOREFRONT_RO;
  const title = isEn
    ? 'Storefront Terms — Consumer ↔ Restaurant'
    : 'Termeni Storefront — Consumator și Restaurant';
  const subtitle = isEn
    ? 'Sale contract is concluded directly with the Restaurant; HIR is a technical intermediary.'
    : 'Contractul de vânzare este încheiat direct cu Restaurantul. HIR este intermediar tehnic, nu vânzător.';
  const headerNote = isEn
    ? 'This English text is an informational summary. The authoritative Romanian version applies in case of any discrepancy.'
    : 'Document afișat consumatorului la finalizarea comenzii. Pentru contractul B2B HIR ↔ Restaurant, vezi /terms.';

  return (
    <LegalShell
      locale={isEn ? 'en' : 'ro'}
      title={title}
      subtitle={subtitle}
      lastUpdated={TERMS_STOREFRONT_LAST_UPDATED}
      version={TERMS_STOREFRONT_VERSION}
      sections={sections}
      headerNote={headerNote}
    />
  );
}
