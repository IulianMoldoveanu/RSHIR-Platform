import type { Metadata } from 'next';
import {
  MarketingHeader,
  MarketingFooter,
} from '@/components/marketing/marketing-shell';
import { getLocale } from '@/lib/i18n/server';
import { EmbedSnippetCopy } from './EmbedSnippetCopy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Widget de comenzi pentru site-ul dumneavoastră — HIR',
  description:
    'Adăugați butonul de comenzi HIR pe orice site cu o singură linie de cod. Personalizat cu culorile dumneavoastră, fără dezvoltatori.',
  openGraph: {
    title: 'Widget de comenzi HIR',
    description:
      'Un singur <script> și restaurantul dumneavoastră primește comenzi direct de pe site-ul propriu.',
    type: 'website',
    locale: 'ro_RO',
  },
  robots: { index: true, follow: true },
};

export default function EmbedDocsPage() {
  const currentLocale = getLocale();
  return (
    <div className="min-h-screen bg-white">
      <MarketingHeader currentLocale={currentLocale} />

      <main className="mx-auto max-w-3xl px-4 pb-20 pt-10 sm:pt-14">
        <p className="text-xs font-medium uppercase tracking-widest text-purple-700">
          Pentru restaurante cu site propriu
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
          Widget HIR pentru site-ul dumneavoastră
        </h1>
        <p className="mt-3 text-base leading-relaxed text-zinc-600">
          Aveți deja un site (WordPress, Wix, propriu)? Lipiți o singură linie
          de cod și un buton flotant
          <span className="mx-1 inline-flex items-center rounded-full bg-orange-500 px-3 py-0.5 align-middle text-xs font-semibold text-white shadow-sm">
            Comandă online
          </span>
          apare în colțul paginii. Clienții comandă fără să părăsească
          site-ul.
        </p>

        <section className="mt-10">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
            1. Codul de instalare
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            Înlocuiți <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs">restaurantul-meu</code>{' '}
            cu identificatorul (slug-ul) restaurantului dumneavoastră de pe HIR
            și lipiți codul înainte de tag-ul de închidere{' '}
            <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs">{'</body>'}</code>.
          </p>
          <div className="mt-4">
            <EmbedSnippetCopy />
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
            2. Personalizare
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            Toate atributele sunt opționale. Dacă lipsesc, widget-ul folosește
            valorile implicite.
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Atribut</th>
                  <th className="px-4 py-3 font-medium">Valori</th>
                  <th className="px-4 py-3 font-medium">Implicit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-700">
                <tr>
                  <td className="px-4 py-3 font-mono text-xs">data-tenant</td>
                  <td className="px-4 py-3">
                    Slug-ul restaurantului (obligatoriu)
                  </td>
                  <td className="px-4 py-3 text-zinc-400">—</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono text-xs">data-color</td>
                  <td className="px-4 py-3">Culoare HEX (#RRGGBB)</td>
                  <td className="px-4 py-3 font-mono text-xs">#FF6B35</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono text-xs">data-position</td>
                  <td className="px-4 py-3">
                    bottom-right · bottom-left · top-right · top-left
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">bottom-right</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono text-xs">data-label</td>
                  <td className="px-4 py-3">Text afișat pe buton (max. 40 caractere)</td>
                  <td className="px-4 py-3">Comandă online</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
            3. Cum funcționează
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-zinc-700">
            <li className="flex gap-3">
              <span className="mt-1 inline-block h-1.5 w-1.5 flex-none rounded-full bg-purple-600" />
              <span>
                Butonul flotant apare pe orice pagină pe care lipiți script-ul.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 inline-block h-1.5 w-1.5 flex-none rounded-full bg-purple-600" />
              <span>
                La click se deschide un dialog (iframe) cu meniul și flow-ul
                complet de comandă HIR. Clientul nu părăsește site-ul
                dumneavoastră.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 inline-block h-1.5 w-1.5 flex-none rounded-full bg-purple-600" />
              <span>
                După comandă reușită, widget-ul declanșează un eveniment
                <code className="mx-1 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs">
                  hir:order_placed
                </code>
                pe care îl puteți asculta pentru analytics.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 inline-block h-1.5 w-1.5 flex-none rounded-full bg-purple-600" />
              <span>
                Iframe-ul folosește sandbox strict (allow-scripts,
                allow-same-origin, allow-forms, allow-popups).
              </span>
            </li>
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
            4. Tracking de conversie (opțional)
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            Adăugați acest snippet pentru a primi un eveniment când o comandă
            este plasată. Funcționează cu Google Analytics, Meta Pixel sau
            orice alt sistem care acceptă evenimente custom.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-zinc-900 p-4 text-xs leading-relaxed text-zinc-100">
{`document.addEventListener('hir:order_placed', function (event) {
  // event.detail = { orderId, total, ts }
  console.log('Comandă HIR plasată:', event.detail);
  // ex: gtag('event', 'purchase', { transaction_id: event.detail.orderId,
  //                                  value: event.detail.total });
});`}
          </pre>
        </section>

        <section className="mt-12 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
          <h3 className="text-sm font-semibold text-zinc-900">Asistență</h3>
          <p className="mt-1 text-sm text-zinc-600">
            Aveți nevoie de ajutor cu instalarea? Scrieți-ne la{' '}
            <a
              href="mailto:contact@hir.ro"
              className="font-medium text-purple-700 hover:text-purple-800"
            >
              contact@hir.ro
            </a>{' '}
            și instalăm widget-ul împreună cu echipa dumneavoastră tehnică.
          </p>
        </section>
      </main>

      <MarketingFooter currentLocale={currentLocale} />
    </div>
  );
}
