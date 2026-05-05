// Lane J — Stripe Checkout Session redirects here when the customer cancels
// the hosted payment page (clicks the back arrow on Stripe's side, or closes
// the tab). The order row stays PENDING/UNPAID; the customer can come back
// to /track and retry payment, or the restaurant cancels it manually.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, XCircle } from 'lucide-react';
import { resolveTenantFromHost } from '@/lib/tenant';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function CheckoutCancelPage() {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) notFound();

  const locale = getLocale();

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-10 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <XCircle className="h-8 w-8" aria-hidden />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        {t(locale, 'checkout.cancel_title')}
      </h1>
      <p className="mt-3 text-sm text-zinc-600">
        {t(locale, 'checkout.cancel_body')}
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-purple-700 px-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-purple-800"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        {t(locale, 'checkout.cancel_back_cta')}
      </Link>
    </main>
  );
}
