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
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-amber-50 text-amber-600 shadow-lg shadow-amber-500/20 ring-1 ring-amber-200">
        <XCircle className="h-10 w-10" aria-hidden strokeWidth={2.25} />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
        {t(locale, 'checkout.cancel_title')}
      </h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-zinc-600">
        {t(locale, 'checkout.cancel_body')}
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-purple-700 px-4 text-base font-semibold text-white shadow-md shadow-purple-700/30 transition-all hover:-translate-y-px hover:bg-purple-800 hover:shadow-lg hover:shadow-purple-700/40 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-purple-500 focus-visible:outline-offset-2"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        {t(locale, 'checkout.cancel_back_cta')}
      </Link>
    </main>
  );
}
