import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';

export default function NotFound() {
  const locale = getLocale();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{t(locale, 'notFound.title')}</h1>
      <p className="text-sm text-zinc-600">{t(locale, 'notFound.body')}</p>
    </main>
  );
}
