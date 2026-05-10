import { z } from 'zod';
import { notFound } from 'next/navigation';
import { TrackClient } from './TrackClient';
import { getLocale } from '@/lib/i18n/server';
import { CookieConsent } from '@/components/legal/cookie-consent';
import { resolveTenantFromHost } from '@/lib/tenant';
import { readCustomerCookie } from '@/lib/customer-recognition';

export const dynamic = 'force-dynamic';

export default async function TrackPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const parsed = z.string().uuid().safeParse(params.token);
  if (!parsed.success) notFound();
  const locale = getLocale();
  const { tenant } = await resolveTenantFromHost();
  const showAccountNudge = tenant ? readCustomerCookie(tenant.id) !== null : false;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <TrackClient token={parsed.data} locale={locale} showAccountNudge={showAccountNudge} />
      <CookieConsent locale={locale} />
    </main>
  );
}
