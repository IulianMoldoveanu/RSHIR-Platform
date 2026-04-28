import Link from 'next/link';
import { Banknote, Clock, Flame, MessageCircle, Star, Truck, UserRound } from 'lucide-react';
import { t, type Locale } from '@/lib/i18n';
import { formatRon } from '@/lib/format';
import { LocaleSwitcher } from './locale-switcher';

type TenantHeaderProps = {
  name: string;
  logoUrl: string | null;
  coverUrl: string | null;
  whatsappPhone: string | null;
  locale: Locale;
  showAccountLink?: boolean;
  rating?: { average: number; count: number } | null;
  minOrderRon?: number;
  freeDeliveryThresholdRon?: number;
  deliveryEtaMinMinutes?: number;
  deliveryEtaMaxMinutes?: number;
  /** Today's non-cancelled order count for the social-proof pill (S2).
   *  Pill renders only when >= 5 — see TODAY_ORDERS_PILL_FLOOR. */
  todayOrderCount?: number;
};

// Avoid awkward "1 comandă azi" early in the day. Once 5 orders are in,
// the flame pill becomes a useful social-proof signal.
const TODAY_ORDERS_PILL_FLOOR = 5;

function whatsappOrderUrl(phone: string, name: string, locale: Locale): string {
  const text = t(locale, 'header.whatsapp_text_template', { name });
  const cleaned = phone.replace(/[^0-9]/g, '');
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(text)}`;
}

export function TenantHeader({
  name,
  logoUrl,
  coverUrl,
  whatsappPhone,
  locale,
  showAccountLink = false,
  rating = null,
  minOrderRon = 0,
  freeDeliveryThresholdRon = 0,
  deliveryEtaMinMinutes = 0,
  deliveryEtaMaxMinutes = 0,
  todayOrderCount = 0,
}: TenantHeaderProps) {
  const showTodayPill = todayOrderCount >= TODAY_ORDERS_PILL_FLOOR;
  // Compute the ETA chip text once.
  let etaText: string | null = null;
  if (deliveryEtaMinMinutes > 0 && deliveryEtaMaxMinutes > 0) {
    etaText = t(locale, 'header.delivery_eta_range_template', {
      min: String(deliveryEtaMinMinutes),
      max: String(deliveryEtaMaxMinutes),
    });
  } else if (deliveryEtaMinMinutes > 0) {
    etaText = t(locale, 'header.delivery_eta_single_template', {
      minutes: String(deliveryEtaMinMinutes),
    });
  }

  return (
    <header className="relative">
      {/* Cover. Brand-color tinted gradient when no cover — picks up
          --hir-brand from the storefront layout's CSS var.  When a cover
          image exists we overlay a soft gradient that blends the brand
          color into a darker bottom for legible name/chips on the next
          row. */}
      <div
        className="relative h-44 w-full overflow-hidden sm:h-64"
        style={{
          background: coverUrl
            ? '#e4e4e7'
            : 'linear-gradient(135deg, color-mix(in srgb, var(--hir-brand) 22%, transparent) 0%, color-mix(in srgb, var(--hir-brand) 8%, transparent) 50%, color-mix(in srgb, var(--hir-brand) 0%, transparent) 100%)',
        }}
      >
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            width={1200}
            height={500}
            className="h-full w-full object-cover"
            loading="eager"
            fetchPriority="high"
          />
        ) : null}
        {/* Brand-tinted scrim. Visible on cover images, invisible when
            there's no cover (already a brand gradient). */}
        {coverUrl && (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to bottom, color-mix(in srgb, var(--hir-brand) 8%, transparent) 0%, transparent 30%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.45) 100%)',
            }}
          />
        )}
        <div className="absolute right-3 top-3">
          <LocaleSwitcher current={locale} ariaLabel={t(locale, 'header.switch_locale')} />
        </div>
      </div>

      {/* Identity row: logo + name + rating */}
      <div className="mx-auto flex max-w-2xl items-end gap-3 px-4 pb-2 pt-3 sm:gap-4">
        <div className="-mt-12 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-white shadow-md sm:-mt-14 sm:h-28 sm:w-28">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={name}
              width={112}
              height={112}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-2xl font-semibold tracking-tight text-zinc-900">
              {name.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
            {name}
          </h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {rating && rating.count > 0 ? (
              <span
                className="inline-flex items-center gap-1 text-xs font-medium text-zinc-800"
                aria-label={`${rating.average.toFixed(1)} (${rating.count})`}
              >
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                <span className="tabular-nums">{rating.average.toFixed(1)}</span>
                <span className="text-zinc-400">({rating.count})</span>
              </span>
            ) : null}
            <Link
              href="/bio"
              className="text-xs uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-800"
            >
              {t(locale, 'header.bio_link')}
            </Link>
            {showAccountLink ? (
              <Link
                href="/account"
                className="inline-flex items-center gap-1 text-xs font-medium text-purple-700 transition-colors hover:text-purple-900"
              >
                <UserRound className="h-3.5 w-3.5" aria-hidden />
                {t(locale, 'account.header_link')}
              </Link>
            ) : null}
          </div>
        </div>

        {whatsappPhone ? (
          <a
            href={whatsappOrderUrl(whatsappPhone, name, locale)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            <MessageCircle className="h-4 w-4" />
            <span className="hidden sm:inline">{t(locale, 'header.whatsapp_long')}</span>
            <span className="sm:hidden">{t(locale, 'header.whatsapp_short')}</span>
          </a>
        ) : null}
      </div>

      {/* Chip strip — ETA · min order · free delivery threshold. Renders
          only when at least one chip is configured. Each chip has its
          own icon + tinted bg for visual separation. */}
      {(etaText || minOrderRon > 0 || freeDeliveryThresholdRon > 0 || showTodayPill) && (
        <div className="mx-auto max-w-2xl px-4 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            {showTodayPill && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-medium text-orange-800 ring-1 ring-inset ring-orange-200">
                <Flame className="h-3 w-3" aria-hidden />
                {t(locale, 'header.today_orders_template', {
                  count: String(todayOrderCount),
                })}
              </span>
            )}
            {etaText && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-700">
                <Clock className="h-3 w-3" aria-hidden />
                {etaText}
              </span>
            )}
            {minOrderRon > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-700">
                <Banknote className="h-3 w-3" aria-hidden />
                {t(locale, 'header.min_order_template', { amount: formatRon(minOrderRon, locale) })}
              </span>
            )}
            {freeDeliveryThresholdRon > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
                <Truck className="h-3 w-3" aria-hidden />
                {t(locale, 'header.free_delivery_template', {
                  amount: formatRon(freeDeliveryThresholdRon, locale),
                })}
              </span>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
