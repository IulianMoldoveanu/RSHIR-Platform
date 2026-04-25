'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Elements } from '@stripe/react-stripe-js';
import { getStripeClient } from '@/lib/stripe/client';
import { geocodeAddressRo } from '@/lib/zones/nominatim';
import { useCart, type CartSnapshot, CART_STORAGE_KEY } from './useCart';
import { PaymentForm } from './PaymentForm';
import { formatRon } from '@/lib/format';
import { t, type Locale } from '@/lib/i18n';

type Quote = {
  lineItems: Array<{ itemId: string; name: string; priceRon: number; quantity: number; lineTotalRon: number }>;
  subtotalRon: number;
  deliveryFeeRon: number;
  totalRon: number;
  distanceKm: number;
  zoneId: string;
  tierId: string;
};

type IntentResponse = {
  orderId: string;
  publicTrackToken: string;
  clientSecret: string;
  quote: Quote;
};

type QuoteFailureReason =
  | { kind: 'OUTSIDE_ZONE' }
  | { kind: 'NO_TIER'; distanceKm: number }
  | { kind: 'ITEM_UNAVAILABLE'; itemId: string }
  | { kind: 'EMPTY_MENU' };

type Step = 'form' | 'review' | 'payment' | 'submitting';

export function CheckoutClient(props: {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  tenantPhone: string;
  locale: Locale;
}) {
  const router = useRouter();
  const { cart, loading: cartLoading } = useCart();
  const { locale } = props;

  const [step, setStep] = useState<Step>('form');

  // Customer
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Address
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('Brașov');
  const [postalCode, setPostalCode] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  const [notes, setNotes] = useState('');

  // Quote / intent state
  const [quote, setQuote] = useState<Quote | null>(null);
  const [intent, setIntent] = useState<IntentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const stripePromise = useMemo(() => getStripeClient(), []);

  const cartTotal = useMemo(() => {
    if (!cart) return 0;
    return cart.items.reduce((s, l) => s + l.priceRon * l.quantity, 0);
  }, [cart]);

  // ────────────────────────────────────────────────
  // Step transitions
  // ────────────────────────────────────────────────

  async function handleGeocode() {
    setError(null);
    if (!line1.trim() || !city.trim()) return;
    setGeocoding(true);
    try {
      const hit = await geocodeAddressRo(`${line1}, ${city}, Romania`);
      if (!hit) {
        setError(t(locale, 'checkout.err_address_not_found'));
        setCoords(null);
      } else {
        setCoords(hit);
      }
    } finally {
      setGeocoding(false);
    }
  }

  async function handleQuote(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!cart || cart.items.length === 0) {
      setError(t(locale, 'checkout.err_cart_empty'));
      return;
    }
    let point = coords;
    if (!point) {
      setGeocoding(true);
      try {
        point = await geocodeAddressRo(`${line1}, ${city}, Romania`);
      } finally {
        setGeocoding(false);
      }
      if (!point) {
        setError(t(locale, 'checkout.err_geocode_failed'));
        return;
      }
      setCoords(point);
    }

    setWorking(true);
    try {
      const res = await fetch('/api/checkout/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: cart.items.map((i) => ({ itemId: i.itemId, quantity: i.quantity })),
          address: { line1, line2, city, postalCode, lat: point.lat, lng: point.lng },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const reason = data?.reason as QuoteFailureReason | undefined;
        setError(formatQuoteError(reason, props.tenantPhone, locale));
        setQuote(null);
      } else {
        setQuote(data.quote as Quote);
        setStep('review');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function handleProceedToPayment() {
    if (!cart) return;
    setError(null);
    setWorking(true);
    try {
      const res = await fetch('/api/checkout/intent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: cart.items.map((i) => ({ itemId: i.itemId, quantity: i.quantity })),
          address: { line1, line2, city, postalCode, lat: coords!.lat, lng: coords!.lng },
          customer: { firstName, lastName, phone, email },
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const reason = data?.reason as QuoteFailureReason | undefined;
        setError(
          reason
            ? formatQuoteError(reason, props.tenantPhone, locale)
            : (data?.error ?? t(locale, 'checkout.err_create_order')),
        );
        return;
      }
      setIntent(data as IntentResponse);
      setStep('payment');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  }

  function handlePaymentSuccess() {
    if (!intent) return;
    sessionStorage.removeItem(CART_STORAGE_KEY);
    router.push(`/track/${intent.publicTrackToken}`);
  }

  // ────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────

  if (cartLoading) {
    return <p className="text-sm text-zinc-500">{t(locale, 'checkout.cart_loading')}</p>;
  }
  if (!cart || cart.items.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <p className="text-sm text-zinc-700">{t(locale, 'checkout.cart_empty')}</p>
        <a href="/" className="mt-3 inline-block text-sm font-medium text-purple-700 underline">
          {t(locale, 'checkout.back_to_menu')}
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ProgressIndicator step={step} locale={locale} />

      <CartSummaryBox cart={cart} fallbackTotal={cartTotal} quote={quote} locale={locale} />

      {error && (
        <div role="alert" className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* STEP 1: form */}
      <fieldset disabled={step !== 'form' || working} className="space-y-6">
        <Section title={t(locale, 'checkout.section_your_data')}>
          <Field label={t(locale, 'checkout.field_first_name')}>
            <input className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </Field>
          <Field label={t(locale, 'checkout.field_last_name')}>
            <input className={inputCls} value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </Field>
          <Field label={t(locale, 'checkout.field_phone')}>
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" />
          </Field>
          <Field label={t(locale, 'checkout.field_email_optional')}>
            <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </Field>
        </Section>

        <Section title={t(locale, 'checkout.section_delivery')}>
          <Field label={t(locale, 'checkout.field_street')}>
            <input className={inputCls} value={line1} onChange={(e) => setLine1(e.target.value)} onBlur={handleGeocode} required />
          </Field>
          <Field label={t(locale, 'checkout.field_apt')}>
            <input className={inputCls} value={line2} onChange={(e) => setLine2(e.target.value)} />
          </Field>
          <Field label={t(locale, 'checkout.field_city')}>
            <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} required />
          </Field>
          <Field label={t(locale, 'checkout.field_postal')}>
            <input className={inputCls} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
          </Field>
          <p className="text-xs text-zinc-500">
            {geocoding && t(locale, 'checkout.verifying_address')}
            {!geocoding && coords && (
              <span className="text-emerald-700">
                {t(locale, 'checkout.address_located_template', {
                  lat: coords.lat.toFixed(4),
                  lng: coords.lng.toFixed(4),
                })}
              </span>
            )}
            {!geocoding && !coords && t(locale, 'checkout.will_locate')}
          </p>
        </Section>

        <Section title={t(locale, 'checkout.section_notes')}>
          <Field label="">
            <textarea className={`${inputCls} min-h-[60px]`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </Field>
        </Section>

        <button
          type="button"
          onClick={(e) => void handleQuote(e)}
          className="w-full rounded-md bg-purple-700 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-purple-800 disabled:opacity-60"
          disabled={working || !firstName || !lastName || !phone || !line1 || !city}
        >
          {working ? t(locale, 'checkout.calculating') : t(locale, 'checkout.calculate_delivery_fee')}
        </button>
      </fieldset>

      {/* STEP 2: review */}
      {step === 'review' && quote && (
        <Section title={t(locale, 'checkout.section_confirm')}>
          <ReviewBox quote={quote} locale={locale} />
          <div className="flex gap-2 pt-3">
            <button
              type="button"
              onClick={() => setStep('form')}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {t(locale, 'checkout.modify')}
            </button>
            <button
              type="button"
              onClick={() => void handleProceedToPayment()}
              disabled={working}
              className="flex-1 rounded-md bg-purple-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-800 disabled:opacity-60"
            >
              {working
                ? t(locale, 'checkout.preparing_payment')
                : t(locale, 'checkout.pay_template', { amount: formatRon(quote.totalRon, locale) })}
            </button>
          </div>
        </Section>
      )}

      {/* STEP 3: payment */}
      {step === 'payment' && intent && (
        <Section title={t(locale, 'checkout.section_payment')}>
          <Elements stripe={stripePromise} options={{ clientSecret: intent.clientSecret, locale }}>
            <PaymentForm
              orderId={intent.orderId}
              amountRon={intent.quote.totalRon}
              locale={locale}
              onSuccess={handlePaymentSuccess}
              onError={(msg) => setError(msg)}
            />
          </Elements>
        </Section>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────
// helpers
// ───────────────────────────────────────────────

const inputCls =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900">{title}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm sm:col-span-2">
      {label && <span className="text-xs font-medium text-zinc-700">{label}</span>}
      {children}
    </label>
  );
}

function ProgressIndicator({ step, locale }: { step: Step; locale: Locale }) {
  const stepNum = step === 'form' ? 1 : step === 'review' ? 2 : 3;
  const labels = [
    t(locale, 'checkout.step_details'),
    t(locale, 'checkout.step_review'),
    t(locale, 'checkout.step_payment'),
  ];
  return (
    <ol className="flex items-center gap-2 text-xs text-zinc-500">
      {labels.map((label, i) => {
        const idx = i + 1;
        const active = idx <= stepNum;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                active ? 'bg-purple-700 text-white' : 'bg-zinc-200 text-zinc-600'
              }`}
            >
              {idx}
            </span>
            <span className={active ? 'font-medium text-zinc-800' : ''}>{label}</span>
            {idx < 3 && <span aria-hidden className="h-px w-6 bg-zinc-300" />}
          </li>
        );
      })}
    </ol>
  );
}

function CartSummaryBox({
  cart,
  fallbackTotal,
  quote,
  locale,
}: {
  cart: CartSnapshot;
  fallbackTotal: number;
  quote: Quote | null;
  locale: Locale;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-600">
        {t(locale, 'checkout.your_cart')}
      </p>
      <ul className="space-y-1">
        {cart.items.map((it) => (
          <li key={it.itemId} className="flex justify-between">
            <span>
              {it.quantity}× {it.name}
            </span>
            <span className="font-mono text-zinc-700">{formatRon(it.priceRon * it.quantity, locale)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 border-t border-zinc-200 pt-2 text-xs text-zinc-600">
        {t(locale, 'checkout.subtotal_estimated_template', {
          amount: formatRon(quote?.subtotalRon ?? fallbackTotal, locale),
        })}
      </div>
    </section>
  );
}

function ReviewBox({ quote, locale }: { quote: Quote; locale: Locale }) {
  return (
    <div className="space-y-1 text-sm sm:col-span-2">
      <Row label={t(locale, 'checkout.subtotal')} value={formatRon(quote.subtotalRon, locale)} />
      <Row
        label={t(locale, 'checkout.delivery_fee_template', { distance: quote.distanceKm.toFixed(1) })}
        value={formatRon(quote.deliveryFeeRon, locale)}
      />
      <Row bold label={t(locale, 'checkout.total')} value={formatRon(quote.totalRon, locale)} />
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'border-t border-zinc-200 pt-1 font-semibold' : ''}`}>
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function formatQuoteError(
  reason: QuoteFailureReason | undefined,
  phone: string,
  locale: Locale,
): string {
  if (!reason) return t(locale, 'checkout.err_quote_default');
  const phoneOrFallback = phone || t(locale, 'checkout.err_phone_fallback');
  switch (reason.kind) {
    case 'OUTSIDE_ZONE':
      return t(locale, 'checkout.err_outside_zone_template', { phone: phoneOrFallback });
    case 'NO_TIER':
      return t(locale, 'checkout.err_no_tier_template', {
        distance: reason.distanceKm.toFixed(1),
        phone: phoneOrFallback,
      });
    case 'ITEM_UNAVAILABLE':
      return t(locale, 'checkout.err_item_unavailable');
    case 'EMPTY_MENU':
      return t(locale, 'checkout.err_empty_menu');
  }
}

export type { Quote };
