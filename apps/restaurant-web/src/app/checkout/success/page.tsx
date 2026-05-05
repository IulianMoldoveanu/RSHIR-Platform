// Lane J — Stripe Checkout Session redirects here after a successful payment.
// We don't trust the URL params alone for state changes; the webhook is the
// source of truth for flipping payment_status → PAID. This page is purely a
// landing UX — confirm to the customer that the order was received and link
// them to /track for live status.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2, ChevronLeft } from 'lucide-react';
import { resolveTenantFromHost } from '@/lib/tenant';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: { order_id?: string; token?: string };
}) {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) notFound();

  const locale = getLocale();
  const orderId = searchParams.order_id ?? '';
  const token = searchParams.token ?? '';
  const shortId = orderId.slice(0, 8);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-10 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <CheckCircle2 className="h-8 w-8" aria-hidden />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        {t(locale, 'checkout.success_title')}
      </h1>
      <p className="mt-3 text-sm text-zinc-600">
        {shortId
          ? t(locale, 'checkout.success_body_template', { id: shortId })
          : t(locale, 'checkout.success_body_generic')}
      </p>
      <div className="mt-8 flex w-full flex-col gap-2">
        {token ? (
          <Link
            href={`/track/${token}`}
            className="flex h-12 w-full items-center justify-center rounded-full bg-purple-700 px-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-purple-800"
          >
            {t(locale, 'checkout.success_track_cta')}
          </Link>
        ) : null}
        <Link
          href="/"
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {t(locale, 'checkout.back_to_menu')}
        </Link>
      </div>
    </main>
  );
}
