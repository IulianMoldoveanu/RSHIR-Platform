import Link from 'next/link';
import { MessageCircle, Star } from 'lucide-react';
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
};

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
}: TenantHeaderProps) {
  const thresholdParts: string[] = [];
  if (minOrderRon > 0) {
    thresholdParts.push(
      t(locale, 'header.min_order_template', {
        amount: formatRon(minOrderRon, locale),
      }),
    );
  }
  if (freeDeliveryThresholdRon > 0) {
    thresholdParts.push(
      t(locale, 'header.free_delivery_template', {
        amount: formatRon(freeDeliveryThresholdRon, locale),
      }),
    );
  }
  return (
    <header className="relative">
      <div
        className={`relative h-40 w-full overflow-hidden sm:h-56 ${
          coverUrl
            ? 'bg-zinc-200'
            : 'bg-gradient-to-br from-purple-700/25 via-purple-500/10 to-purple-300/5'
        }`}
      >
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="eager"
            fetchPriority="high"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/0 to-black/40" />
        <div className="absolute right-3 top-3">
          <LocaleSwitcher current={locale} ariaLabel={t(locale, 'header.switch_locale')} />
        </div>
      </div>

      <div className="mx-auto flex max-w-2xl items-end gap-3 px-4 pb-3 pt-3 sm:gap-4">
        <div className="-mt-10 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-white shadow-md sm:h-24 sm:w-24">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={name} className="h-full w-full object-cover" />
          ) : (
            <span className="text-xl font-semibold text-zinc-900">{name.slice(0, 2).toUpperCase()}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
            {name}
          </h1>
          <div className="flex items-center gap-3">
            {rating && rating.count > 0 ? (
              <span
                className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700"
                aria-label={`${rating.average.toFixed(1)} (${rating.count})`}
              >
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                <span>{rating.average.toFixed(1)}</span>
                <span className="text-zinc-400">({rating.count})</span>
              </span>
            ) : null}
            <Link
              href="/bio"
              className="text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-700"
            >
              {t(locale, 'header.bio_link')}
            </Link>
            {thresholdParts.length > 0 && (
              <span className="text-xs text-zinc-500">
                {thresholdParts.join(' · ')}
              </span>
            )}
            {showAccountLink ? (
              <Link
                href="/account"
                className="text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-700"
              >
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
            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
          >
            <MessageCircle className="h-4 w-4" />
            <span className="hidden sm:inline">{t(locale, 'header.whatsapp_long')}</span>
            <span className="sm:hidden">{t(locale, 'header.whatsapp_short')}</span>
          </a>
        ) : null}
      </div>
    </header>
  );
}
