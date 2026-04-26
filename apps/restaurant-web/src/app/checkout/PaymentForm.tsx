'use client';

import { useState } from 'react';
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { formatRon } from '@/lib/format';
import { t, type Locale } from '@/lib/i18n';

export function PaymentForm(props: {
  orderId: string;
  amountRon: number;
  locale: Locale;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const { locale } = props;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);

    const { error } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: {},
    });

    if (error) {
      props.onError(error.message ?? t(locale, 'checkout.err_payment_failed'));
      setSubmitting(false);
      return;
    }

    // Payment succeeded — defense-in-depth call to /confirm flips status to PAID
    // and kicks off delivery handoff (also handled by webhook).
    try {
      const res = await fetch('/api/checkout/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: props.orderId }),
      });
      const data = await res.json();
      if (!res.ok) {
        props.onError(data?.error ?? t(locale, 'checkout.err_order_not_confirmed'));
        setSubmitting(false);
        return;
      }
    } catch (err) {
      props.onError((err as Error).message);
      setSubmitting(false);
      return;
    }

    props.onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 sm:col-span-2">
      <PaymentElement options={{ layout: 'tabs' }} />
      <button
        type="submit"
        disabled={!stripe || !elements || submitting}
        className="flex h-12 w-full items-center justify-center rounded-full bg-purple-700 px-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-purple-800 disabled:opacity-60"
      >
        {submitting
          ? t(locale, 'checkout.processing_payment')
          : t(locale, 'checkout.pay_template', { amount: formatRon(props.amountRon, locale) })}
      </button>
      <p className="text-center text-xs text-zinc-500">{t(locale, 'checkout.test_card_hint')}</p>
    </form>
  );
}
