'use client';

import { useState } from 'react';
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';

export function PaymentForm(props: {
  orderId: string;
  amountRon: number;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

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
      props.onError(error.message ?? 'Plata a eșuat. Încearcă din nou.');
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
        props.onError(data?.error ?? 'Comanda nu a putut fi confirmată.');
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
        className="w-full rounded-md bg-purple-700 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-purple-800 disabled:opacity-60"
      >
        {submitting ? 'Se procesează plata…' : `Plătește ${props.amountRon.toFixed(2)} RON`}
      </button>
      <p className="text-center text-xs text-zinc-500">
        Test card: 4242 4242 4242 4242 · orice dată viitoare · orice CVC
      </p>
    </form>
  );
}
