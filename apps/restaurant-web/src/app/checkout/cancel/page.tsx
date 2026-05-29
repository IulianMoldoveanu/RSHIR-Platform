// Lane J — PSP redirects here when the customer cancels the hosted payment
// page (closes the tab, back-arrow, etc.). The order row stays PENDING /
// UNPAID. Until P0 audit #12 the storefront also wiped the cart on the
// way out to the PSP, so a customer returning here found a blank menu →
// re-built the cart → submitted a SECOND order, resulting in 2 PENDING
// duplicates. We now keep the cart on intent OK and offer an explicit
// "Continuă comanda anterioară" button: clicking it CANCELS the prior
// PENDING row (atomic UPDATE WHERE status='PENDING' AND id=intent_id) and
// drops the customer back at the storefront with the cart intact.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, XCircle } from 'lucide-react';
import { resolveTenantFromHost } from '@/lib/tenant';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import { CancelResumeCta } from '@/components/storefront/cancel-resume-cta';

export const dynamic = 'force-dynamic';

export default async function CheckoutCancelPage(
  props: {
    searchParams: Promise<{ order_id?: string }>;
  },
) {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) notFound();

  const locale = await getLocale();
  const searchParams = await props.searchParams;
  const orderId = searchParams.order_id ?? '';

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
      <div className="mt-8 flex w-full flex-col gap-2.5">
        {orderId ? (
          <CancelResumeCta
            orderId={orderId}
            resumeLabel={t(locale, 'checkout.cancel_resume_cta')}
            cartLostMessage={t(locale, 'checkout.cancel_cart_lost')}
          />
        ) : null}
        <Link
          href="/"
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {t(locale, 'checkout.cancel_back_cta')}
        </Link>
      </div>
    </main>
  );
}
