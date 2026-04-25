import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { t, type Locale } from '@/lib/i18n';
import { LocaleSwitcher } from './locale-switcher';

type TenantHeaderProps = {
  name: string;
  logoUrl: string | null;
  coverUrl: string | null;
  whatsappPhone: string | null;
  locale: Locale;
  showAccountLink?: boolean;
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
}: TenantHeaderProps) {
  return (
    <header className="relative">
      <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-zinc-200 to-zinc-300 sm:h-56">
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
            <Link
              href="/bio"
              className="text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-700"
            >
              {t(locale, 'header.bio_link')}
            </Link>
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
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
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
