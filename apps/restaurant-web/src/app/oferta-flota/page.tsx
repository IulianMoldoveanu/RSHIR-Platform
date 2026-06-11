// /oferta-flota?fleet=<name> — printable HTML proposal for fleet managers.
//
// Created 2026-06-11 as a pragmatic alternative after @react-pdf/renderer
// kept throwing reconciler error #31 on Next 15 server-side renders. The
// browser print-to-PDF flow is the most reliable cross-platform way to hand
// a fleet manager a branded proposal: Iulian opens this URL with `?fleet=
// <numele lor>`, hits Ctrl/Cmd+P, and saves as PDF (or shares the URL).
//
// All content lives inline (no DB read, no auth) — pitch material, public
// by design. The @media print stylesheet hides page chrome (the Print
// button) and forces A4 page breaks between major sections.

import type { Metadata } from 'next';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_FLEET_NAME = 'Flota dumneavoastra';

function sanitizeFleet(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return DEFAULT_FLEET_NAME;
  // eslint-disable-next-line no-control-regex
  const cleaned = String(value).replace(/[\x00-\x1F\x7F]/g, '').trim();
  return cleaned.slice(0, 100) || DEFAULT_FLEET_NAME;
}

export async function generateMetadata(props: {
  searchParams: Promise<{ fleet?: string }>;
}): Promise<Metadata> {
  const sp = await props.searchParams;
  const fleet = sanitizeFleet(sp.fleet);
  return {
    title: `HIR - Propunere ${fleet}`,
    robots: { index: false, follow: false },
  };
}

export default async function OfertaFlotaPage(props: {
  searchParams: Promise<{ fleet?: string }>;
}) {
  const sp = await props.searchParams;
  const fleet = sanitizeFleet(sp.fleet);
  const dateRo = new Intl.DateTimeFormat('ro-RO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Bucharest',
  }).format(new Date());

  return (
    <main className="bg-zinc-100 print:bg-white">
      <style>{`
        @page { size: A4; margin: 18mm 16mm; }
        @media print {
          .no-print { display: none !important; }
          .page-break { page-break-after: always; }
          body, main { background: white !important; }
        }
      `}</style>

      {/* Top action bar - hidden when printing */}
      <div className="no-print sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-600">
            Propunere personalizata pentru <strong className="text-zinc-900">{fleet}</strong>
          </p>
          <PrintButton />
        </div>
      </div>

      {/* Document */}
      <article className="mx-auto max-w-4xl bg-white px-10 py-12 text-zinc-900 print:max-w-none print:px-0 print:py-0">
        {/* Cover */}
        <header className="mb-12">
          <div className="mb-6 h-1 w-16 bg-indigo-600" />
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-indigo-600">
            HIRforYOU
          </p>
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            Propunere Parteneriat Manager Flota
          </h1>
          <p className="mt-3 text-lg text-zinc-600">
            Infrastructura de livrare locala. Puterea ramane la tine si la vendori.
          </p>
          <div className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-5">
            <p className="text-sm text-zinc-500">Pentru</p>
            <p className="mt-1 text-xl font-semibold">{fleet}</p>
            <p className="mt-3 text-sm text-zinc-500">Pregatit la {dateRo}</p>
            <p className="mt-1 text-sm font-medium">Iulian Moldoveanu, HIRforYOU SRL</p>
          </div>
        </header>

        {/* Section: Executive Summary */}
        <section className="mb-10">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-indigo-600">
            Sumar executiv
          </p>
          <h2 className="text-2xl font-bold tracking-tight">De ce aceasta propunere</h2>
          <p className="mt-4 leading-relaxed text-zinc-700">
            HIRforYOU iti ofera infrastructura tehnica (storefront vendor,
            dispecerizare curieri, AI Hepi, multi-vendor pool) pentru a transforma
            flota ta locala intr-o retea de livrare profesionista - fara sa cedezi
            controlul comercial sau relatia cu restaurantele. Tu pastrezi tarifele,
            tu pastrezi clientii, tu pastrezi marja.
          </p>
          <p className="mt-3 leading-relaxed text-zinc-700">
            HIR este invizibil pentru vendor in Modelul A si complet transparent in
            Modelele B si C. Comisioane fixe, predictibile, fara procent din cosul
            de cumparaturi.
          </p>
          <div className="mt-5 rounded-lg border-l-4 border-indigo-600 bg-indigo-50 p-4">
            <p className="text-sm font-medium text-indigo-900">
              2 lei + TVA 21% per comanda procesata (vendor) si 1 leu + TVA 21%
              per comanda livrata (tu). TVA este pass-through, virata la ANAF -
              nu intra in marja HIR.
            </p>
          </div>
        </section>

        {/* Section: 3 models */}
        <section className="mb-10">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-indigo-600">
            Modele de colaborare
          </p>
          <h2 className="text-2xl font-bold tracking-tight">Cele 3 modele de pricing</h2>
          <p className="mt-3 text-zinc-700">
            Iti recomandam sa adaptezi modelul in functie de ce vrea fiecare restaurant.
            Toate 3 lasa flota cu marja - doar relatia HIR - restaurant difera.
          </p>

          <div className="mt-5 space-y-4">
            <div className="rounded-lg border border-zinc-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                Model A - Dispatch Only
              </p>
              <p className="mt-1 font-semibold">Restaurantul NU foloseste HIR. Flota dispecerizeaza manual.</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-700">
                Restaurantul te suna sau iti trimite pe WhatsApp comanda. Tu o introduci
                manual in panoul HIR. Algoritmul aloca cel mai apropiat curier din flota
                ta. HIR este invizibil pentru restaurant. Restaurantul plateste DOAR
                flota (tariful tau de livrare).
                Tu platesti HIR <strong>1 leu + TVA</strong> per comanda dispecerizata.
              </p>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                Model B - HIR Connect
              </p>
              <p className="mt-1 font-semibold">Restaurantul are propriul site. Plugin Connect trimite comenzile la HIR.</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-700">
                Restaurantul are propriul site (WooCommerce, custom etc.). Plugin
                HIR Connect trimite comenzile automat la HIR la moment plata. HIR
                dispatch catre flota ta. Status update merge inapoi la site.
                Restaurantul plateste fleet (tariful tau) si HIR <strong>2 lei + TVA</strong>
                pentru data layer. Tu platesti HIR <strong>1 leu + TVA</strong> per comanda.
              </p>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
                Model C - Full Stack HIR
              </p>
              <p className="mt-1 font-semibold">Restaurantul foloseste TOATA platforma HIR.</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-700">
                Restaurantul foloseste storefront white-label HIR + KDS + CRM + AI Hepi
                + dispatch. Site nou cu brand propriu in 5 minute. Restaurantul
                plateste HIR <strong>2 lei + TVA</strong> per comanda procesata. Tu platesti HIR
                <strong> 1 leu + TVA</strong> per comanda livrata. Recomandat pentru restaurante
                noi sau cele care vor brand digital fara batai de cap.
              </p>
            </div>
          </div>
        </section>

        <div className="page-break" />

        {/* Section: Roles */}
        <section className="mb-10">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-indigo-600">
            Cum impartim rolurile
          </p>
          <h2 className="text-2xl font-bold tracking-tight">Cele 4 ROLURI in fluxul de livrare</h2>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-zinc-50 p-4">
              <p className="font-semibold">HIR (Iulian)</p>
              <p className="mt-1 text-sm text-zinc-700">
                Software + orchestrare + suport tehnic + integrare PSP. NU intervine
                in plati intre vendor si flota.
              </p>
            </div>
            <div className="rounded-lg bg-zinc-50 p-4">
              <p className="font-semibold">Vendor (restaurant, florarie, magazin)</p>
              <p className="mt-1 text-sm text-zinc-700">
                Produsul + bucataria/stocul + emite bonul fiscal + relatia cu clientul final.
              </p>
            </div>
            <div className="rounded-lg bg-zinc-50 p-4">
              <p className="font-semibold">FLOTA (TU)</p>
              <p className="mt-1 text-sm text-zinc-700">
                Coordonare curieri + zone de livrare + relatia directa cu vendorii + tariful per livrare.
              </p>
            </div>
            <div className="rounded-lg bg-zinc-50 p-4">
              <p className="font-semibold">Curier</p>
              <p className="mt-1 text-sm text-zinc-700">
                Executia livrarii. Ridica de la vendor, livreaza la client final.
              </p>
            </div>
          </div>
        </section>

        {/* Section: Your role */}
        <section className="mb-10">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-indigo-600">
            Rolul tau
          </p>
          <h2 className="text-2xl font-bold tracking-tight">Ce faci tu ca Fleet Manager</h2>
          <ul className="mt-4 space-y-3 text-zinc-700">
            <li className="flex gap-2">
              <span className="font-semibold text-indigo-600">-</span>
              <span>
                <strong>Setezi propriile tarife</strong> per livrare cu fiecare restaurant
                (orientativ 20-50 RON zone-based, libertate totala).
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-indigo-600">-</span>
              <span>
                <strong>Platesti curierii</strong> cum vrei (PFA, contract, fix lunar, per livrare).
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-indigo-600">-</span>
              <span>
                <strong>Negociezi termenii</strong> direct cu restaurantele. HIR nu se amesteca.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-indigo-600">-</span>
              <span>
                Vezi <strong>hartile live</strong>, KPI per curier (P50/P90 dwell time,
                delivery rate), SLA scorecards in panoul tau.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-indigo-600">-</span>
              <span>
                Acces la <strong>multi-vendor pool</strong>: extinde activarea in pharma, magazine,
                florarii fara curieri suplimentari.
              </span>
            </li>
          </ul>
        </section>

        <div className="page-break" />

        {/* Section: Pricing table */}
        <section className="mb-10">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-indigo-600">
            Ce te taxez (HIR)
          </p>
          <h2 className="text-2xl font-bold tracking-tight">Tarife HIR per comanda</h2>
          <table className="mt-4 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-zinc-300">
                <th className="py-2 text-left font-semibold">Componenta</th>
                <th className="py-2 text-right font-semibold">Tarif</th>
                <th className="py-2 text-right font-semibold">Cine plateste</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-zinc-200">
                <td className="py-3">SaaS vendor (storefront, KDS, CRM, AI)</td>
                <td className="py-3 text-right font-mono">2 lei + TVA 21%</td>
                <td className="py-3 text-right text-zinc-600">Restaurant</td>
              </tr>
              <tr className="border-b border-zinc-200">
                <td className="py-3">Dispatch + orchestrare flota</td>
                <td className="py-3 text-right font-mono">1 leu + TVA 21%</td>
                <td className="py-3 text-right text-zinc-600">Manager flota (tu)</td>
              </tr>
              <tr className="border-b border-zinc-200">
                <td className="py-3">Onboarding, training, integrare</td>
                <td className="py-3 text-right font-mono">0 lei</td>
                <td className="py-3 text-right text-zinc-600">Inclus</td>
              </tr>
              <tr className="border-b border-zinc-200">
                <td className="py-3">Suport tehnic + bug fixes</td>
                <td className="py-3 text-right font-mono">0 lei</td>
                <td className="py-3 text-right text-zinc-600">Inclus</td>
              </tr>
              <tr>
                <td className="py-3">Hardware / dispozitive</td>
                <td className="py-3 text-right font-mono">0 lei</td>
                <td className="py-3 text-right text-zinc-600">Optional, la cerere</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs italic text-zinc-500">
            Facturare saptamanala (luni dimineata pentru saptamana precedenta), termen plata 7 zile.
            TVA 21% pass-through (colectata si virata la ANAF), nu intra in marja HIR.
          </p>
        </section>

        {/* Section: Volume scenarios */}
        <section className="mb-10">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-indigo-600">
            Cifre estimative
          </p>
          <h2 className="text-2xl font-bold tracking-tight">Scenarii pentru reteaua ta</h2>
          <p className="mt-3 text-zinc-700">
            Asumand 10 restaurante in Bucuresti, marja per livrare 9 RON (25 RON tarif tu - 16 RON curier).
          </p>
          <table className="mt-4 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-zinc-300">
                <th className="py-2 text-left font-semibold">Volum / restaurant</th>
                <th className="py-2 text-right font-semibold">Comenzi / luna</th>
                <th className="py-2 text-right font-semibold">Plata ta catre HIR</th>
                <th className="py-2 text-right font-semibold">Marja TA estimata</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-zinc-200">
                <td className="py-3 text-rose-700">Pesimist (15 ord/zi)</td>
                <td className="py-3 text-right font-mono">4.500</td>
                <td className="py-3 text-right font-mono">4.500 RON</td>
                <td className="py-3 text-right font-mono">36.000 RON</td>
              </tr>
              <tr className="border-b border-zinc-200 bg-amber-50/50">
                <td className="py-3 font-semibold text-amber-700">Realist (30 ord/zi)</td>
                <td className="py-3 text-right font-mono">9.000</td>
                <td className="py-3 text-right font-mono">9.000 RON</td>
                <td className="py-3 text-right font-mono">72.000 RON</td>
              </tr>
              <tr>
                <td className="py-3 text-emerald-700">Optimist (50 ord/zi)</td>
                <td className="py-3 text-right font-mono">15.000</td>
                <td className="py-3 text-right font-mono">15.000 RON</td>
                <td className="py-3 text-right font-mono">120.000 RON</td>
              </tr>
            </tbody>
          </table>
        </section>

        <div className="page-break" />

        {/* Section: Next steps */}
        <section className="mb-10">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-indigo-600">
            Pasii pentru a incepe
          </p>
          <h2 className="text-2xl font-bold tracking-tight">Timeline 5 zile</h2>
          <ol className="mt-4 space-y-3 text-zinc-700">
            <li>
              <strong>Ziua 1:</strong> Self-signup la
              <span className="ml-1 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-sm">app.hirforyou.ro/fleet-signup</span>
              - completezi datele firmei flotei + emailul tau.
            </li>
            <li>
              <strong>Ziua 2:</strong> Upload KYF (act constitutiv, extras cont, certificat ONRC) la
              <span className="ml-1 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-sm">curier.hirforyou.ro/fleet/kyf</span>
            </li>
            <li>
              <strong>Ziua 3:</strong> Aprobare KYF (24h) - eu primesc cererea ta + verific actele.
            </li>
            <li>
              <strong>Ziua 4-5:</strong> Onboarding restaurantele tale - creez tenant per restaurant,
              configurez meniul (sau il importam din GloriaFood/CSV), activez storefronts.
            </li>
            <li>
              <strong>Ziua 6:</strong> Live cu primele comenzi. Suport on-call de la mine in primele 2 saptamani.
            </li>
          </ol>
        </section>

        {/* Section: Contact CTA */}
        <section className="mb-10 rounded-lg bg-indigo-600 p-8 text-white print:bg-indigo-600">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200">
            Urmatorul pas
          </p>
          <h2 className="mt-2 text-2xl font-bold">Hai sa pornim impreuna</h2>
          <p className="mt-3 text-sm leading-relaxed text-indigo-50">
            Daca propunerea iti face sens, urmatorul pas este self-signup. Sau ma poti
            suna direct sa clarificam orice detaliu inainte.
          </p>
          <div className="mt-5 grid gap-3 text-sm">
            <p>
              <span className="text-indigo-200">Telefon:</span>{' '}
              <strong>+40 743 700 916</strong>
            </p>
            <p>
              <span className="text-indigo-200">Email:</span>{' '}
              <strong>office@hirforyou.ro</strong>
            </p>
            <p>
              <span className="text-indigo-200">Self-signup:</span>{' '}
              <strong>app.hirforyou.ro/fleet-signup</strong>
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-12 border-t border-zinc-200 pt-6 text-xs text-zinc-500">
          <p>
            <strong className="text-zinc-700">HIRforYOU SRL</strong> - CUI RO46864293 - Brasov, Romania
          </p>
          <p className="mt-1">
            Document orientativ. Termenii finali se confirma la semnarea contractului
            individualizat de prestari servicii.
          </p>
        </footer>
      </article>
    </main>
  );
}
