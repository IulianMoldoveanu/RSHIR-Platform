// /legal/rambursare — Refund Policy (B2C, Consumer ↔ Restaurant via HIR).
import type { Metadata } from 'next';
import { tenantBaseUrl } from '@/lib/tenant';
import { getLocale } from '@/lib/i18n/server';
import { LegalShell } from '@/components/legal/LegalShell';
import {
  REFUND_RO,
  REFUND_LAST_UPDATED,
  REFUND_VERSION,
} from '@/content/legal/rambursare';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = getLocale();
  const url = `${tenantBaseUrl()}/legal/rambursare`;
  const title = locale === 'en' ? 'Refund Policy' : 'Politica de rambursare';
  const description =
    locale === 'en'
      ? 'How refunds work for orders placed via a HIR-hosted Storefront. Refunds are issued from the Restaurant\'s payout via the PSP.'
      : 'Cum funcționează rambursările pentru comenzile plasate prin Storefront-uri găzduite de HIR. Rambursarea se inițiază din payout-ul Restaurantului prin PSP.';
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: { 'ro-RO': url, en: url, 'x-default': url },
    },
  };
}

export default async function RefundPage() {
  const locale = getLocale();
  const isEn = locale === 'en';
  return (
    <LegalShell
      locale={isEn ? 'en' : 'ro'}
      title={isEn ? 'Refund Policy' : 'Politica de rambursare'}
      subtitle={
        isEn
          ? 'Eligibility, procedure, and why HIR does not refund from its own balance.'
          : 'Eligibilitate, procedură și de ce HIR nu rambursează din lichiditatea proprie.'
      }
      lastUpdated={REFUND_LAST_UPDATED}
      version={REFUND_VERSION}
      sections={REFUND_RO}
      headerNote={
        isEn
          ? 'Complements /terms/storefront sections 6-7. Romanian is the authoritative version.'
          : 'Completează /terms/storefront Secțiunile 6-7. Versiunea autoritativă este textul RO.'
      }
    />
  );
}
