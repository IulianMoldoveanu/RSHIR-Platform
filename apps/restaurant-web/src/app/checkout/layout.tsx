import { CookieConsent } from '@/components/legal/cookie-consent';
import { getLocale } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  const locale = getLocale();
  return (
    <>
      {children}
      <CookieConsent locale={locale} />
    </>
  );
}
