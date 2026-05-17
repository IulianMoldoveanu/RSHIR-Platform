// Lane J — Stripe Checkout Session redirects here after a successful payment.
// We don't trust the URL params alone for state changes; the webhook is the
// source of truth for flipping payment_status → PAID. This page is purely a
// landing UX — confirm to the customer that the order was received and link
// them to /track for live status.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2, ChevronLeft } from 'lucide-react';
import { resolveTenantFromHost } from '@/lib/tenant';
import { isEmbedMode } from '@/lib/embed';
import { EmbedOrderPlaced } from '@/components/storefront/embed-order-placed';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function CheckoutSuccessPage(
  props: {
    searchParams: Promise<{ order_id?: string; token?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) notFound();

  const locale = getLocale();
  const orderId = searchParams.order_id ?? '';
  const token = searchParams.token ?? '';
  const shortId = orderId.slice(0, 8);
  const embed = isEmbedMode();

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-10 text-center">
      {embed && <EmbedOrderPlaced orderId={orderId || null} total={null} />}
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 shadow-lg shadow-emerald-500/20 ring-1 ring-emerald-200">
        <CheckCircle2 className="h-10 w-10" aria-hidden strokeWidth={2.25} />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
        {t(locale, 'checkout.success_title')}
      </h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-zinc-600">
        {shortId
          ? t(locale, 'checkout.success_body_template', { id: shortId })
          : t(locale, 'checkout.success_body_generic')}
      </p>
      <div className="mt-8 flex w-full flex-col gap-2.5">
        {token ? (
          <Link
            href={`/track/${token}`}
            className="flex h-12 w-full items-center justify-center rounded-full bg-purple-700 px-4 text-base font-semibold text-white shadow-md shadow-purple-700/30 transition-all hover:-translate-y-px hover:bg-purple-800 hover:shadow-lg hover:shadow-purple-700/40 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-purple-500 focus-visible:outline-offset-2"
          >
            {t(locale, 'checkout.success_track_cta')}
          </Link>
        ) : null}
        <Link
          href="/"
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-purple-500 focus-visible:outline-offset-2"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {t(locale, 'checkout.back_to_menu')}
        </Link>
      </div>
    </main>
  );
}
