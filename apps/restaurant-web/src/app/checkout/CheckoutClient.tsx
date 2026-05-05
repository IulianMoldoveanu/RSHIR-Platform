'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingBag, TriangleAlert } from 'lucide-react';
import { EmptyState } from '@/components/storefront/empty-state';
import { geocodeAddressRo } from '@/lib/zones/nominatim';
import { useCart, type CartSnapshot, CART_STORAGE_KEY } from './useCart';
import { formatRon } from '@/lib/format';
import { t, type Locale } from '@/lib/i18n';
import { readStoredPromo, writeStoredPromo } from '@/lib/cart/promo';

type Fulfillment = 'DELIVERY' | 'PICKUP';

type PromoKind = 'PERCENT' | 'FIXED' | 'FREE_DELIVERY';

type AppliedPromo = {
  code: string;
  kind: PromoKind;
  value_int: number;
};

type Quote = {
  lineItems: Array<{ itemId: string; name: string; priceRon: number; quantity: number; lineTotalRon: number }>;
  subtotalRon: number;
  deliveryFeeRon: number;
  discountRon: number;
  totalRon: number;
  fulfillment: Fulfillment;
  distanceKm: number;
  zoneId: string | null;
  tierId: string | null;
  promo: { id: string; code: string; kind: PromoKind; valueInt: number } | null;
};

type IntentResponse = {
  orderId: string;
  publicTrackToken: string;
  paymentMethod: 'CARD' | 'COD';
  /**
   * Stripe Checkout Session URL — present only when paymentMethod === 'CARD'.
   * Client window.location-redirects to this URL; Stripe hosts the payment
   * form and bounces back to /checkout/success or /checkout/cancel.
   */
  url?: string;
  quote: Quote;
};

type PaymentMethod = 'CARD' | 'COD';

type PromoFailureReason =
  | 'not_found'
  | 'inactive'
  | 'expired'
  | 'not_yet_valid'
  | 'min_not_met'
  | 'usage_exhausted';

type QuoteFailureReason =
  | { kind: 'OUTSIDE_ZONE' }
  | { kind: 'NO_TIER'; distanceKm: number }
  | { kind: 'ITEM_UNAVAILABLE'; itemId: string }
  | { kind: 'EMPTY_MENU' }
  | { kind: 'PROMO_INVALID'; reason: PromoFailureReason }
  | { kind: 'GROUP_CONSTRAINT'; itemId: string; groupName: string; reason: 'too_few' | 'too_many' };

// Lane J — drop the in-app 'payment' step. CARD path redirects directly to
// the Stripe-hosted Checkout URL after the intent call succeeds.
type Step = 'form' | 'review' | 'submitting';

// Normalize whatever the user typed into a 9-digit local RO mobile number.
// Accepts +40, 0040, 40, leading 0, or bare digits. Caps at 9 — extra digits
// after a paste from contacts get silently dropped instead of failing
// server-side validation. Empty when the input has no digits.
function normalizeRoPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0040')) return digits.slice(4, 13);
  if (digits.startsWith('40')) return digits.slice(2, 11);
  if (digits.startsWith('0')) return digits.slice(1, 10);
  return digits.slice(0, 9);
}

type Prefill = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  line1: string;
  line2: string;
  city: string;
  postalCode: string;
};

type LoyaltyContext = {
  balancePoints: number;
  ronPerPoint: number;
  minPointsToRedeem: number;
  maxRedemptionPct: number;
};

export function CheckoutClient(props: {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  tenantPhone: string;
  pickupEnabled: boolean;
  pickupAddress: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  codEnabled: boolean;
  prefill: Prefill | null;
  loyalty: LoyaltyContext | null;
  locale: Locale;
}) {
  const router = useRouter();
  const { cart, loading: cartLoading } = useCart();
  const { locale, pickupEnabled, pickupAddress, pickupLat, pickupLng, codEnabled, prefill, loyalty } =
    props;

  // Loyalty redemption toggle — wired up after the quote state below.
  const [redeemActive, setRedeemActive] = useState(false);

  const [step, setStep] = useState<Step>('form');
  const [fulfillment, setFulfillment] = useState<Fulfillment>('DELIVERY');
  // Default 'CARD' so existing tenants and tenants without COD configured
  // see the unchanged Stripe flow. The radio only appears when codEnabled.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CARD');

  // Customer — prefilled from the most recent order for known customers
  // (cookie-recognized). Speeds up repeat checkout by ~5 fields.
  const [firstName, setFirstName] = useState(prefill?.firstName ?? '');
  const [lastName, setLastName] = useState(prefill?.lastName ?? '');
  const [phone, setPhone] = useState(prefill?.phone ?? '');
  const [email, setEmail] = useState(prefill?.email ?? '');

  // Address — Romanian apartment-block deliveries reliably need
  // bloc/scară/etaj/apartament as discrete fields (couriers use them
  // to actually find the door). We surface 4 short inputs and pack
  // them into the API's `line2` string at submit time.
  const [line1, setLine1] = useState(prefill?.line1 ?? '');
  // line2 in prior orders is the 'Bl. X, Sc. Y, Et. Z, Ap. W' string we
  // built. We don't try to back-parse into the 4 fields — let the user
  // re-enter or keep blank; it's optional anyway.
  const [aptBlock, setAptBlock] = useState('');
  const [aptStair, setAptStair] = useState('');
  const [aptFloor, setAptFloor] = useState('');
  const [aptUnit, setAptUnit] = useState('');
  const line2 = useMemo(() => {
    const parts: string[] = [];
    if (aptBlock.trim()) parts.push(`Bl. ${aptBlock.trim()}`);
    if (aptStair.trim()) parts.push(`Sc. ${aptStair.trim()}`);
    if (aptFloor.trim()) parts.push(`Et. ${aptFloor.trim()}`);
    if (aptUnit.trim()) parts.push(`Ap. ${aptUnit.trim()}`);
    return parts.join(', ');
  }, [aptBlock, aptStair, aptFloor, aptUnit]);
  const [city, setCity] = useState(prefill?.city || 'Brașov');
  const [postalCode, setPostalCode] = useState(prefill?.postalCode ?? '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  // Captures the address text the coords were geocoded against. If the user
  // edits any field after blurring, coords no longer matches the typed text;
  // we invalidate to force a fresh geocode on the next quote attempt.
  const [coordsForText, setCoordsForText] = useState<string>('');
  const [geocoding, setGeocoding] = useState(false);

  const currentAddressKey = `${line1.trim()}|${line2.trim()}|${city.trim()}|${postalCode.trim()}`;
  useEffect(() => {
    if (coords && coordsForText && coordsForText !== currentAddressKey) {
      setCoords(null);
      setCoordsForText('');
    }
  }, [coords, coordsForText, currentAddressKey]);

  const [notes, setNotes] = useState('');

  // Promo
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoWorking, setPromoWorking] = useState(false);

  // Quote / intent state. Lane J: we no longer keep an `intent` in component
  // state — the response is consumed once and the customer is either
  // window.location-redirected (CARD) or router-pushed to /track (COD).
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const errorRef = useRef<HTMLDivElement | null>(null);

  // Compute the redeemable points + discount the customer is allowed to
  // burn against the current quote. Server is authoritative — this is for
  // displaying the toggle. Returns null when not eligible (no balance, no
  // quote yet, or below threshold).
  const loyaltyRedeem = useMemo(() => {
    if (!loyalty || !quote) return null;
    if (loyalty.balancePoints < loyalty.minPointsToRedeem) return null;
    const cap = (Number(quote.totalRon) * loyalty.maxRedemptionPct) / 100;
    const maxByPoints = loyalty.balancePoints * loyalty.ronPerPoint;
    const discountRon = Math.min(cap, maxByPoints);
    if (discountRon <= 0) return null;
    const points = Math.min(
      loyalty.balancePoints,
      Math.floor(discountRon / loyalty.ronPerPoint),
    );
    if (points < loyalty.minPointsToRedeem) return null;
    return {
      points,
      discountRon: Number((points * loyalty.ronPerPoint).toFixed(2)),
    };
  }, [loyalty, quote]);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  useEffect(() => {
    const stored = readStoredPromo();
    if (stored) setAppliedPromo(stored);
    // Only run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cartTotal = useMemo(() => {
    if (!cart) return 0;
    return cart.items.reduce((s, l) => {
      const modSum = l.modifiers.reduce((ms, m) => ms + m.priceDeltaRon, 0);
      return s + (l.priceRon + modSum) * l.quantity;
    }, 0);
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
        setCoordsForText('');
      } else {
        setCoords(hit);
        setCoordsForText(currentAddressKey);
      }
    } finally {
      setGeocoding(false);
    }
  }

  async function handleQuote(e: React.FormEvent) {
    e.preventDefault();
    return runQuote(appliedPromo?.code);
  }

  async function runQuote(promoCode: string | undefined): Promise<void> {
    setError(null);
    if (!cart || cart.items.length === 0) {
      setError(t(locale, 'checkout.err_cart_empty'));
      return;
    }

    let body: Record<string, unknown>;
    if (fulfillment === 'PICKUP') {
      body = {
        items: cart.items.map((i) => ({
          itemId: i.itemId,
          quantity: i.quantity,
          modifierIds: i.modifiers.map((m) => m.id),
        })),
        fulfillment: 'PICKUP',
        ...(promoCode ? { promoCode } : {}),
      };
    } else {
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
        setCoordsForText(currentAddressKey);
      }
      body = {
        items: cart.items.map((i) => ({
          itemId: i.itemId,
          quantity: i.quantity,
          modifierIds: i.modifiers.map((m) => m.id),
        })),
        fulfillment: 'DELIVERY',
        address: { line1, line2, city, postalCode, lat: point.lat, lng: point.lng },
        ...(promoCode ? { promoCode } : {}),
      };
    }

    setWorking(true);
    try {
      const res = await fetch('/api/checkout/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
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
      const intentBody: Record<string, unknown> = {
        items: cart.items.map((i) => ({
          itemId: i.itemId,
          quantity: i.quantity,
          modifierIds: i.modifiers.map((m) => m.id),
        })),
        fulfillment,
        customer: { firstName, lastName, phone: phone ? `+40${phone}` : '', email },
        notes,
        paymentMethod,
        ...(appliedPromo ? { promoCode: appliedPromo.code } : {}),
        ...(redeemActive && loyaltyRedeem ? { redeemPoints: loyaltyRedeem.points } : {}),
      };
      if (fulfillment === 'DELIVERY') {
        intentBody.address = {
          line1,
          line2,
          city,
          postalCode,
          lat: coords!.lat,
          lng: coords!.lng,
        };
      }
      const res = await fetch('/api/checkout/intent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(intentBody),
      });
      const data = await res.json();
      if (!res.ok) {
        const reason = data?.reason as QuoteFailureReason | undefined;
        if (data?.error === 'below_min_order' && typeof data?.min_order_ron === 'number') {
          setError(
            t(locale, 'checkout.err_below_min_template', {
              min: formatRon(Number(data.min_order_ron), locale),
            }),
          );
          setStep('form');
          return;
        }
        if (data?.error === 'loyalty_no_account') {
          setError(t(locale, 'loyalty.err_no_account'));
          setRedeemActive(false);
          return;
        }
        if (data?.error === 'loyalty_invalid') {
          const r = data?.reason as string | undefined;
          const key =
            r === 'below_min'
              ? 'loyalty.err_below_min'
              : r === 'insufficient_balance'
                ? 'loyalty.err_insufficient_balance'
                : r === 'exceeds_cap'
                  ? 'loyalty.err_exceeds_cap'
                  : 'loyalty.err_default';
          setError(t(locale, key));
          setRedeemActive(false);
          return;
        }
        setError(
          reason
            ? formatQuoteError(reason, props.tenantPhone, locale)
            : (data?.error ?? t(locale, 'checkout.err_create_order')),
        );
        return;
      }
      const response = data as IntentResponse;
      // Clear the cart immediately for both branches — once the order is
      // persisted in restaurant_orders the cart no longer represents
      // pending intent. If the customer abandons Stripe checkout, the
      // /checkout/cancel landing offers a return-to-menu link.
      sessionStorage.removeItem(CART_STORAGE_KEY);
      writeStoredPromo(null);

      if (response.paymentMethod === 'COD') {
        // COD orders skip Stripe entirely. Order is already PENDING in the
        // DB; the customer goes straight to /track and the restaurant
        // confirms via the admin UI.
        router.push(`/track/${response.publicTrackToken}`);
        return;
      }
      // Lane J — CARD path. Redirect to the Stripe-hosted checkout URL.
      // No publishable key, no Elements, no on-page payment form.
      if (!response.url) {
        setError(t(locale, 'checkout.err_create_order'));
        return;
      }
      window.location.href = response.url;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function handleApplyPromo() {
    if (!cart) return;
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setPromoError(null);
    setPromoWorking(true);
    try {
      const res = await fetch('/api/checkout/promo/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, subtotalRon: cartTotal }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        const reason = data?.reason as PromoFailureReason | undefined;
        setPromoError(formatPromoError(reason, locale));
        setAppliedPromo(null);
        setQuote(null);
        // Bounce back to form so user can re-quote with new state.
        setStep('form');
        return;
      }
      const next: AppliedPromo = {
        code: String(data.code),
        kind: data.kind as PromoKind,
        value_int: Number(data.value_int) || 0,
      };
      const wasReviewing = step === 'review';
      setAppliedPromo(next);
      writeStoredPromo(next);
      setPromoInput('');
      setQuote(null);
      // If the user was already on the review step, auto re-quote with the
      // new discount so they don't have to re-tap the primary CTA — pass the
      // code explicitly because setAppliedPromo state hasn't flushed yet.
      if (wasReviewing) {
        await runQuote(next.code);
      } else {
        setStep('form');
      }
    } finally {
      setPromoWorking(false);
    }
  }

  function handleRemovePromo() {
    setAppliedPromo(null);
    writeStoredPromo(null);
    setPromoError(null);
    setQuote(null);
    setStep('form');
  }

  // ────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────

  if (cartLoading) {
    return <p className="text-sm text-zinc-500">{t(locale, 'checkout.cart_loading')}</p>;
  }
  if (!cart || cart.items.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag className="h-8 w-8 text-purple-400" />}
        title={t(locale, 'storefront.empty_cart_title')}
        description={t(locale, 'storefront.empty_cart_desc')}
        action={{ label: t(locale, 'storefront.empty_cart_action'), href: '/' }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <ProgressIndicator step={step} locale={locale} />

      {/* Lane L PR 3: returning customer welcome badge. Renders only when
          the customer is cookie-recognized AND we have a first-name on
          file (the prefill returns null when there's no prior order, so
          the existence of prefill.firstName is the gate). The customer
          can still override any field — we never block on identity
          mismatch. */}
      {prefill && prefill.firstName && step === 'form' && (
        <div className="rounded-xl border border-purple-200 bg-purple-50/60 px-4 py-3 text-sm">
          <p className="text-base font-semibold text-purple-900">
            {t(locale, 'checkout.welcome_back_template', {
              firstName: prefill.firstName,
            })}
          </p>
          <p className="mt-0.5 text-xs text-purple-800/80">
            {t(locale, 'checkout.welcome_back_hint')}
          </p>
        </div>
      )}

      <CartSummaryBox cart={cart} fallbackTotal={cartTotal} quote={quote} locale={locale} />

      {error && (
        <div
          ref={errorRef}
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
          <p>{error}</p>
        </div>
      )}

      {/* STEP 1: form */}
      <form onSubmit={(e) => void handleQuote(e)} noValidate>
      <fieldset disabled={step !== 'form' || working} className="space-y-6">
        {pickupEnabled && (
          <FulfillmentToggle
            value={fulfillment}
            onChange={setFulfillment}
            locale={locale}
          />
        )}

        <Section title={t(locale, 'checkout.section_your_data')}>
          <Field label={t(locale, 'checkout.field_first_name')}>
            <input className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </Field>
          <Field label={t(locale, 'checkout.field_last_name')}>
            <input className={inputCls} value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </Field>
          <Field label={t(locale, 'checkout.field_phone')}>
            <div className="flex items-stretch overflow-hidden rounded-md border border-zinc-300 bg-white shadow-sm focus-within:border-purple-500 focus-within:ring-1 focus-within:ring-purple-500">
              <span
                aria-hidden
                className="flex items-center bg-zinc-50 px-2.5 text-sm font-medium text-zinc-600"
              >
                +40
              </span>
              <input
                className="w-full border-none bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-0"
                value={phone}
                onChange={(e) => setPhone(normalizeRoPhone(e.target.value))}
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="7XX XXX XXX"
                pattern="[0-9]{9}"
                maxLength={9}
                required
              />
            </div>
          </Field>
          <Field label={t(locale, 'checkout.field_email_optional')}>
            <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </Field>
        </Section>

        {fulfillment === 'DELIVERY' ? (
          <Section title={t(locale, 'checkout.section_delivery')}>
            <Field label={t(locale, 'checkout.field_street')}>
              <input className={inputCls} value={line1} onChange={(e) => setLine1(e.target.value)} onBlur={handleGeocode} required />
            </Field>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-xs font-medium text-zinc-700">
                {t(locale, 'checkout.field_apt_group')}
              </span>
              <div className="grid grid-cols-4 gap-2">
                <input
                  className={inputCls}
                  value={aptBlock}
                  onChange={(e) => setAptBlock(e.target.value)}
                  aria-label={t(locale, 'checkout.field_apt_block')}
                  placeholder={t(locale, 'checkout.field_apt_block')}
                />
                <input
                  className={inputCls}
                  value={aptStair}
                  onChange={(e) => setAptStair(e.target.value)}
                  aria-label={t(locale, 'checkout.field_apt_stair')}
                  placeholder={t(locale, 'checkout.field_apt_stair')}
                />
                <input
                  className={inputCls}
                  value={aptFloor}
                  onChange={(e) => setAptFloor(e.target.value)}
                  aria-label={t(locale, 'checkout.field_apt_floor')}
                  placeholder={t(locale, 'checkout.field_apt_floor')}
                />
                <input
                  className={inputCls}
                  value={aptUnit}
                  onChange={(e) => setAptUnit(e.target.value)}
                  aria-label={t(locale, 'checkout.field_apt_unit')}
                  placeholder={t(locale, 'checkout.field_apt_unit')}
                />
              </div>
            </label>
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
        ) : (
          <PickupBox
            address={pickupAddress}
            lat={pickupLat}
            lng={pickupLng}
            locale={locale}
          />
        )}

        <Section title={t(locale, 'checkout.section_notes')}>
          <Field label="">
            <textarea
              className={`${inputCls} min-h-[60px]`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              aria-label={t(locale, 'checkout.section_notes')}
              placeholder={t(locale, 'checkout.notes_placeholder')}
            />
          </Field>
        </Section>

        {codEnabled && (
          <Section title={t(locale, 'checkout.section_payment_method')}>
            <div className="grid grid-cols-1 gap-2 sm:col-span-2 sm:grid-cols-2">
              <PaymentMethodChip
                active={paymentMethod === 'CARD'}
                onClick={() => setPaymentMethod('CARD')}
                title={t(locale, 'checkout.payment_method_card')}
                hint={t(locale, 'checkout.payment_method_card_hint')}
              />
              <PaymentMethodChip
                active={paymentMethod === 'COD'}
                onClick={() => setPaymentMethod('COD')}
                title={t(locale, 'checkout.payment_method_cod')}
                hint={t(locale, 'checkout.payment_method_cod_hint')}
              />
            </div>
          </Section>
        )}

        <PromoBox
          locale={locale}
          input={promoInput}
          setInput={setPromoInput}
          working={promoWorking}
          applied={appliedPromo}
          error={promoError}
          onApply={() => void handleApplyPromo()}
          onRemove={handleRemovePromo}
        />

        {/* Sticky-bottom container on mobile so the CTA stays in reach while
            the user fills the form. On sm+ it falls back to inline placement
            and the surrounding spacing is identical to before. */}
        <div className="sticky bottom-0 -mx-4 border-t border-zinc-100 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:m-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <button
          type="submit"
          className="flex h-12 w-full items-center justify-center rounded-full bg-purple-700 px-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-purple-800 disabled:opacity-60"
          disabled={
            working ||
            !firstName ||
            !lastName ||
            phone.length !== 9 ||
            (fulfillment === 'DELIVERY' && (!line1 || !city))
          }
        >
          {working
            ? t(locale, 'checkout.calculating')
            : cartTotal > 0
              ? t(locale, 'checkout.continue_with_total_template', {
                  amount: formatRon(cartTotal, locale),
                })
              : t(locale, 'checkout.calculate_delivery_fee')}
        </button>
        </div>
      </fieldset>
      </form>

      {/* STEP 2: review */}
      {step === 'review' && quote && (
        <Section title={t(locale, 'checkout.section_confirm')}>
          <ReviewBox
            quote={quote}
            locale={locale}
            loyaltyDiscountRon={
              redeemActive && loyaltyRedeem ? loyaltyRedeem.discountRon : 0
            }
          />
          {loyaltyRedeem && (
            <button
              type="button"
              onClick={() => setRedeemActive((v) => !v)}
              aria-pressed={redeemActive}
              className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors sm:col-span-2 ${
                redeemActive
                  ? 'border-purple-600 bg-purple-50'
                  : 'border-zinc-200 bg-white hover:bg-zinc-50'
              }`}
            >
              <span className="flex flex-col">
                <span className="font-medium text-zinc-900">
                  {t(locale, 'loyalty.redeem_label_template', {
                    points: String(loyaltyRedeem.points),
                  })}
                </span>
                <span className="text-xs text-zinc-500">
                  {t(locale, 'loyalty.redeem_value_template', {
                    amount: formatRon(loyaltyRedeem.discountRon, locale),
                  })}
                </span>
              </span>
              <span
                className={`text-xs font-semibold ${
                  redeemActive ? 'text-purple-700' : 'text-zinc-500'
                }`}
              >
                {redeemActive
                  ? t(locale, 'loyalty.redeem_active')
                  : t(locale, 'loyalty.redeem_apply')}
              </span>
            </button>
          )}
          <div className="flex gap-2 pt-3 sm:col-span-2">
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
              className="flex h-12 flex-1 items-center justify-center rounded-full bg-purple-700 px-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-purple-800 disabled:opacity-60"
            >
              {working
                ? t(locale, 'checkout.preparing_payment')
                : paymentMethod === 'COD'
                  ? t(locale, 'checkout.place_order_cod_template', {
                      amount: formatRon(
                        Math.max(
                          0,
                          Number(quote.totalRon) -
                            (redeemActive && loyaltyRedeem ? loyaltyRedeem.discountRon : 0),
                        ),
                        locale,
                      ),
                    })
                  : t(locale, 'checkout.pay_template', {
                      amount: formatRon(
                        Math.max(
                          0,
                          Number(quote.totalRon) -
                            (redeemActive && loyaltyRedeem ? loyaltyRedeem.discountRon : 0),
                        ),
                        locale,
                      ),
                    })}
            </button>
          </div>
        </Section>
      )}

      {/* Lane J — STEP 3 (in-app Stripe Elements payment) removed. The CARD
          branch in handleProceedToPayment now redirects via
          window.location.href to a Stripe-hosted Checkout Session URL.
          Stripe bounces back to /checkout/success or /checkout/cancel. */}
    </div>
  );
}

// ───────────────────────────────────────────────
// helpers
// ───────────────────────────────────────────────

const inputCls =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500';

function PaymentMethodChip({
  active,
  onClick,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-3 text-left transition-colors ${
        active
          ? 'border-purple-600 bg-purple-50 ring-1 ring-purple-200'
          : 'border-zinc-200 bg-white hover:bg-zinc-50'
      }`}
    >
      <span className="text-sm font-semibold text-zinc-900">{title}</span>
      <span className="text-xs text-zinc-600">{hint}</span>
    </button>
  );
}

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
  // Filled progress bar pattern (audit §4 P1) — replaces the thin h-px
  // connector lines with proper progress segments that visually indicate
  // how far along the customer is.
  return (
    <ol className="flex items-stretch gap-2 text-xs text-zinc-500" aria-label={t(locale, 'checkout.aria_progress')}>
      {labels.map((label, i) => {
        const idx = i + 1;
        const completed = idx < stepNum;
        const current = idx === stepNum;
        const active = completed || current;
        return (
          <li key={label} className="flex flex-1 flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-[10px] font-semibold ${
                  active ? 'bg-purple-700 text-white' : 'bg-zinc-200 text-zinc-600'
                }`}
              >
                {completed ? '✓' : idx}
              </span>
              <span
                className={`truncate ${current ? 'font-semibold text-zinc-900' : active ? 'font-medium text-zinc-700' : ''}`}
              >
                {label}
              </span>
            </div>
            <span
              aria-hidden
              className={`h-1 rounded-full ${active ? 'bg-purple-600' : 'bg-zinc-200'}`}
            />
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

function ReviewBox({
  quote,
  locale,
  loyaltyDiscountRon = 0,
}: {
  quote: Quote;
  locale: Locale;
  loyaltyDiscountRon?: number;
}) {
  const finalTotal = Math.max(0, Number(quote.totalRon) - loyaltyDiscountRon);
  return (
    <div className="space-y-1 text-sm sm:col-span-2">
      <Row label={t(locale, 'checkout.subtotal')} value={formatRon(quote.subtotalRon, locale)} />
      {quote.fulfillment === 'PICKUP' ? (
        <Row
          label={t(locale, 'track.pickup_at_label')}
          value={formatRon(0, locale)}
        />
      ) : (
        <Row
          label={t(locale, 'checkout.delivery_fee_template', { distance: quote.distanceKm.toFixed(1) })}
          value={formatRon(quote.deliveryFeeRon, locale)}
        />
      )}
      {quote.discountRon > 0 && (
        <Row
          label={`${t(locale, 'promo.cart_discount_label')}${quote.promo ? ` (${quote.promo.code})` : ''}`}
          value={`− ${formatRon(quote.discountRon, locale)}`}
        />
      )}
      {loyaltyDiscountRon > 0 && (
        <Row
          label={t(locale, 'loyalty.discount_label')}
          value={`− ${formatRon(loyaltyDiscountRon, locale)}`}
        />
      )}
      <Row bold label={t(locale, 'checkout.total')} value={formatRon(finalTotal, locale)} />
    </div>
  );
}

function PromoBox({
  locale,
  input,
  setInput,
  working,
  applied,
  error,
  onApply,
  onRemove,
}: {
  locale: Locale;
  input: string;
  setInput: (v: string) => void;
  working: boolean;
  applied: AppliedPromo | null;
  error: string | null;
  onApply: () => void;
  onRemove: () => void;
}) {
  const appliedLabel = applied ? formatAppliedPromo(applied, locale) : null;
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900">
        {t(locale, 'promo.label')}
      </h2>
      {appliedLabel ? (
        <div className="flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900 shadow-sm">
          <span className="flex items-center gap-2">
            <svg
              aria-hidden
              className="h-4 w-4 flex-none text-emerald-600"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <span className="font-medium">{appliedLabel}</span>
          </span>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-emerald-700 transition-colors hover:bg-emerald-100 hover:text-emerald-900"
            aria-label={t(locale, 'promo.remove')}
          >
            ×
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            placeholder={t(locale, 'promo.placeholder')}
            maxLength={32}
            className={`${inputCls} flex-1 font-mono uppercase tracking-wide`}
          />
          <button
            type="button"
            onClick={onApply}
            disabled={working || input.trim().length === 0}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:scale-[1.02] hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:hover:scale-100"
          >
            {working ? t(locale, 'promo.applying') : t(locale, 'promo.apply')}
          </button>
        </div>
      )}
      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-rose-700">
          <span aria-hidden>⚠</span>
          {error}
        </p>
      )}
    </section>
  );
}

function formatAppliedPromo(p: AppliedPromo, locale: Locale): string {
  if (p.kind === 'PERCENT') {
    return t(locale, 'promo.applied_percent_template', { code: p.code, value: p.value_int });
  }
  if (p.kind === 'FIXED') {
    return t(locale, 'promo.applied_fixed_template', { code: p.code, value: p.value_int });
  }
  return t(locale, 'promo.applied_free_delivery_template', { code: p.code });
}

function formatPromoError(reason: PromoFailureReason | undefined, locale: Locale): string {
  if (!reason) return t(locale, 'promo.err_default');
  switch (reason) {
    case 'not_found':
      return t(locale, 'promo.err_not_found');
    case 'inactive':
      return t(locale, 'promo.err_inactive');
    case 'expired':
      return t(locale, 'promo.err_expired');
    case 'not_yet_valid':
      return t(locale, 'promo.err_not_yet_valid');
    case 'usage_exhausted':
      return t(locale, 'promo.err_usage_exhausted');
    case 'min_not_met':
      return t(locale, 'promo.err_default');
    default:
      return t(locale, 'promo.err_default');
  }
}

function FulfillmentToggle({
  value,
  onChange,
  locale,
}: {
  value: Fulfillment;
  onChange: (v: Fulfillment) => void;
  locale: Locale;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900">
        {t(locale, 'checkout.section_fulfillment')}
      </h2>
      <div className="grid grid-cols-2 gap-2" role="radiogroup">
        <FulfillmentRadio
          checked={value === 'DELIVERY'}
          onSelect={() => onChange('DELIVERY')}
          label={t(locale, 'checkout.fulfillment_delivery')}
        />
        <FulfillmentRadio
          checked={value === 'PICKUP'}
          onSelect={() => onChange('PICKUP')}
          label={t(locale, 'checkout.fulfillment_pickup')}
        />
      </div>
    </section>
  );
}

function FulfillmentRadio({
  checked,
  onSelect,
  label,
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={
        'rounded-md border px-3 py-3 text-sm font-medium transition-colors ' +
        (checked
          ? 'border-purple-700 bg-purple-50 text-purple-900'
          : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50')
      }
    >
      {label}
    </button>
  );
}

function PickupBox({
  address,
  lat,
  lng,
  locale,
}: {
  address: string | null;
  lat: number | null;
  lng: number | null;
  locale: Locale;
}) {
  const mapsUrl =
    lat !== null && lng !== null
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : null;
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900">
        {t(locale, 'checkout.section_pickup')}
      </h2>
      {address ? (
        <div className="space-y-2 text-sm">
          <p className="text-xs font-medium text-zinc-600">
            {t(locale, 'checkout.pickup_address_label')}
          </p>
          <p className="text-zinc-900">{address}</p>
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs font-medium text-purple-700 underline"
            >
              {t(locale, 'checkout.pickup_open_in_maps')}
            </a>
          )}
          <p className="text-xs text-emerald-700">{t(locale, 'checkout.pickup_fee_free')}</p>
        </div>
      ) : (
        <p className="text-sm text-rose-700">
          {t(locale, 'checkout.pickup_address_missing')}
        </p>
      )}
    </section>
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
    case 'PROMO_INVALID':
      return formatPromoError(reason.reason, locale);
    case 'GROUP_CONSTRAINT':
      return t(
        locale,
        reason.reason === 'too_few'
          ? 'checkout.err_group_too_few_template'
          : 'checkout.err_group_too_many_template',
        { group: reason.groupName },
      );
  }
}

export type { Quote };
