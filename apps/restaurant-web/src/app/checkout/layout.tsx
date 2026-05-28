import { CookieConsent } from '@/components/legal/cookie-consent';
import { getLocale } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function CheckoutLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <>
      {children}
      <CookieConsent locale={locale} />
    </>
  );
}
