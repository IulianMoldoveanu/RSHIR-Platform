// /legal/subprocesori — public list of HIR sub-processors (DPA §7).
// Custom table layout, doesn't reuse LegalShell because the content is
// inherently tabular.
import type { Metadata } from 'next';
import { tenantBaseUrl } from '@/lib/tenant';
import { getLocale } from '@/lib/i18n/server';
import {
  SUBPROCESSORS,
  SUBPROCESSORS_LAST_UPDATED,
  SUBPROCESSORS_VERSION,
} from '@/content/legal/subprocesori';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = getLocale();
  const url = `${tenantBaseUrl()}/legal/subprocesori`;
  const title = locale === 'en' ? 'Sub-processors' : 'Lista sub-procesatorilor';
  const description =
    locale === 'en'
      ? 'Third-party processors used by HIR to deliver the platform. Updated at least 30 days before new processors handle controller data.'
      : 'Furnizorii terți pe care HIR îi folosește pentru livrarea Platformei. Lista se actualizează cu minimum 30 de zile înainte ca un nou furnizor să prelucreze date de Operator.';
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: { 'ro-RO': url, en: url, 'x-default': url },
    },
  };
}

export default async function SubprocessorsPage() {
  const locale = getLocale();
  const isEn = locale === 'en';
  const dateLabel = formatDate(SUBPROCESSORS_LAST_UPDATED, isEn ? 'en' : 'ro');

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 text-zinc-800">
      <header className="border-b border-zinc-200 pb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          {isEn ? 'Sub-processors' : 'Lista sub-procesatorilor'}
        </h1>
        <p className="mt-2 text-base text-zinc-600">
          {isEn
            ? 'Third parties used to deliver the HIR platform. Updated at least 30 days before new processors handle controller data.'
            : 'Furnizorii terți pe care HIR îi folosește pentru livrarea Platformei. Lista se actualizează cu minimum 30 de zile înainte ca un nou furnizor să prelucreze date de Operator (DPA §7).'}
        </p>
        <p className="mt-3 text-xs text-zinc-500">
          {isEn ? 'Last updated' : 'Ultima actualizare'}:{' '}
          <time dateTime={SUBPROCESSORS_LAST_UPDATED}>{dateLabel}</time>{' · '}
          {isEn ? 'Version' : 'Versiune'} {SUBPROCESSORS_VERSION}
        </p>
      </header>

      <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-zinc-50 text-zinc-700">
            <tr>
              <th className="px-3 py-2 font-medium">{isEn ? 'Sub-processor' : 'Sub-procesator'}</th>
              <th className="px-3 py-2 font-medium">{isEn ? 'Role' : 'Rol'}</th>
              <th className="px-3 py-2 font-medium">{isEn ? 'Data categories' : 'Categorii date'}</th>
              <th className="px-3 py-2 font-medium">{isEn ? 'Location' : 'Locație'}</th>
              <th className="px-3 py-2 font-medium">{isEn ? 'Transfer basis (if outside EEA)' : 'Temei transfer (dacă iese din SEE)'}</th>
              <th className="px-3 py-2 font-medium">Link</th>
            </tr>
          </thead>
          <tbody>
            {SUBPROCESSORS.map((sp) => (
              <tr key={sp.name} className="border-t border-zinc-200 align-top">
                <td className="px-3 py-2 font-medium text-zinc-900">{sp.name}</td>
                <td className="px-3 py-2 text-zinc-700">{sp.role}</td>
                <td className="px-3 py-2 text-zinc-700">{sp.dataCategories}</td>
                <td className="px-3 py-2 text-zinc-700">{sp.location}</td>
                <td className="px-3 py-2 text-zinc-700">{sp.transferBasis}</td>
                <td className="px-3 py-2 text-zinc-700">
                  <a className="text-blue-700 hover:underline" href={sp.url} target="_blank" rel="noopener noreferrer">
                    {isEn ? 'Privacy policy' : 'Politică de confidențialitate'}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-zinc-500">
        {isEn
          ? 'For objection rights related to new sub-processors, see /legal/dpa §7. Contact dpo@hirforyou.ro to raise an objection.'
          : 'Pentru dreptul de obiecție privind sub-procesatorii noi vezi /legal/dpa §7. Obiecții pot fi transmise la dpo@hirforyou.ro.'}
      </p>
    </main>
  );
}

function formatDate(iso: string, locale: 'ro' | 'en'): string {
  try {
    const d = new Date(iso + 'T00:00:00Z');
    return d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'ro-RO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Europe/Bucharest',
    });
  } catch {
    return iso;
  }
}
