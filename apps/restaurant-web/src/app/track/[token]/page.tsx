import { z } from 'zod';
import { notFound } from 'next/navigation';
import { TrackClient } from './TrackClient';
import { getLocale } from '@/lib/i18n/server';
import { CookieConsent } from '@/components/legal/cookie-consent';

export const dynamic = 'force-dynamic';

export default function TrackPage({ params }: { params: { token: string } }) {
  const parsed = z.string().uuid().safeParse(params.token);
  if (!parsed.success) notFound();
  const locale = getLocale();

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <TrackClient token={parsed.data} locale={locale} />
      <CookieConsent locale={locale} />
    </main>
  );
}
