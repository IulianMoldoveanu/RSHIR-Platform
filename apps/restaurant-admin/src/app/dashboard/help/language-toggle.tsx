import { cookies, type UnsafeUnwrappedCookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { HELP_LOCALE_COOKIE, type HelpLocale } from '@/lib/i18n/help-locale';

async function setLocale(locale: HelpLocale) {
  'use server';
  (cookies() as unknown as UnsafeUnwrappedCookies).set({
    name: HELP_LOCALE_COOKIE,
    value: locale,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  revalidatePath('/dashboard/help');
  revalidatePath('/dashboard/help/[category]/[slug]', 'page');
}

async function setRo() {
  'use server';
  await setLocale('ro');
}
async function setEn() {
  'use server';
  await setLocale('en');
}

export function HelpLanguageToggle({
  locale,
  labels,
}: {
  locale: HelpLocale;
  labels: { langToggleLabel: string; langRomanian: string; langEnglish: string };
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-zinc-500">{labels.langToggleLabel}</span>
      <form action={setRo}>
        <button
          type="submit"
          aria-pressed={locale === 'ro'}
          className={
            locale === 'ro'
              ? 'rounded-md bg-purple-600 px-2 py-1 font-medium text-white'
              : 'rounded-md px-2 py-1 text-zinc-600 hover:bg-zinc-100'
          }
        >
          {labels.langRomanian}
        </button>
      </form>
      <form action={setEn}>
        <button
          type="submit"
          aria-pressed={locale === 'en'}
          className={
            locale === 'en'
              ? 'rounded-md bg-purple-600 px-2 py-1 font-medium text-white'
              : 'rounded-md px-2 py-1 text-zinc-600 hover:bg-zinc-100'
          }
        >
          {labels.langEnglish}
        </button>
      </form>
    </div>
  );
}
