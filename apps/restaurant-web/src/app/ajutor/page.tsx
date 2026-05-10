import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronDown, HelpCircle, LifeBuoy, Mail, Phone } from 'lucide-react';
import {
  MarketingHeader,
  MarketingFooter,
} from '@/components/marketing/marketing-shell';
import { getLocale } from '@/lib/i18n/server';

export const runtime = 'nodejs';
export const dynamic = 'force-static';
export const revalidate = 3600;

// Public-facing help center for end customers (the people who place orders
// on tenant storefronts). RO-only for the Brașov pilot — EN/HU/BG follow
// once the importer is verified on real GloriaFood data. Far smaller than
// the dashboard help center: 7 high-volume customer questions.

const PRIMARY_DOMAIN = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || '';
const HELP_URL = PRIMARY_DOMAIN
  ? `https://${PRIMARY_DOMAIN}/ajutor`
  : 'https://hir-restaurant-web.vercel.app/ajutor';

export const metadata: Metadata = {
  title: 'Ajutor — HIR',
  description:
    'Răspunsuri pentru clienții HIR: cum urmăresc comanda, cum o anulez, cum plătesc, ce fac dacă întârzie.',
  alternates: { canonical: HELP_URL },
  robots: { index: true, follow: true },
};

type Faq = {
  q: string;
  a: string;
};

const FAQS: Faq[] = [
  {
    q: 'Cum urmăresc comanda mea?',
    a: 'După plasarea comenzii primiți un link de tracking pe SMS și email. Pagina de tracking arată în timp real status-ul (confirmată, în pregătire, ridicată de curier, în drum, livrată). Curierul devine vizibil pe hartă în momentul ridicării.',
  },
  {
    q: 'Cât durează livrarea?',
    a: 'Timpul estimat este afișat la finalizarea comenzii și include pregătirea + livrarea. În medie comenzile ajung în 30–45 minute. Restaurantul actualizează status-ul live când comanda este gata.',
  },
  {
    q: 'Cum pot anula o comandă?',
    a: 'Puteți anula o comandă din pagina de tracking, butonul "Anulează", DOAR cât timp restaurantul nu a confirmat-o (status "PLACED"). După confirmare, contactați direct restaurantul prin numărul afișat pe pagina de tracking.',
  },
  {
    q: 'Cum plătesc?',
    a: 'Acceptăm plată cu cardul online (Visa, Mastercard) la finalizarea comenzii sau plată cash la livrare. Disponibilitatea metodelor variază pe restaurant și este afișată la checkout. Plățile cu cardul sunt procesate securizat — HIR nu stochează datele cardului.',
  },
  {
    q: 'Comanda întârzie. Ce fac?',
    a: 'Verificați mai întâi pagina de tracking — uneori întârzierile sunt livrate ca update. Dacă nu există update de peste 15 minute față de timpul estimat, sunați restaurantul (numărul e pe pagina de tracking). Pentru probleme repetate, contactați suport HIR.',
  },
  {
    q: 'Pot returna comanda?',
    a: 'Pentru produse alimentare returul nu este posibil odată livrate, conform legii. Dacă produsul ajunge deteriorat sau greșit, refuzați-l la curier și sunați imediat restaurantul. Vom emite rambursarea după validare.',
  },
  {
    q: 'Datele mele personale sunt în siguranță?',
    a: 'Da. Stocăm doar datele necesare pentru livrare (nume, telefon, adresă, email). Nu vindem date către terți. Puteți cere ștergerea contului oricând trimițând email la office@hirforyou.ro. Pentru detalii vedeți Politica de confidențialitate.',
  },
];

export default function HelpPublicPage() {
  const currentLocale = getLocale();

  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC]">
      <MarketingHeader currentLocale={currentLocale} />

      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="flex flex-col gap-2">
          <div className="inline-flex items-center gap-1.5 self-start rounded-full bg-[#EEF2FF] px-2.5 py-1 text-[11px] font-medium text-[#4338CA]">
            <HelpCircle className="h-3 w-3" aria-hidden />
            Ajutor pentru clienți
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#0F172A] sm:text-4xl">
            Cum vă putem ajuta?
          </h1>
          <p className="max-w-2xl text-sm text-[#475569] sm:text-base">
            Răspunsuri rapide pentru cele mai frecvente situații. Dacă nu
            găsiți ce căutați, ne puteți contacta direct.
          </p>
        </header>

        <section className="mt-8 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <ul className="divide-y divide-[#F1F5F9]">
            {FAQS.map((f, i) => (
              <li key={i}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-[#F8FAFC]">
                    <span className="text-sm font-medium text-[#0F172A] sm:text-base">
                      {f.q}
                    </span>
                    <ChevronDown
                      className="h-4 w-4 flex-none text-[#94A3B8] transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <p className="px-4 pb-4 text-sm leading-relaxed text-[#475569]">
                    {f.a}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8 rounded-xl border border-[#E2E8F0] bg-white p-5">
          <div className="flex items-center gap-2">
            <LifeBuoy className="h-4 w-4 text-[#4F46E5]" aria-hidden />
            <h2 className="text-sm font-semibold text-[#0F172A]">
              Tot nu ați găsit răspunsul?
            </h2>
          </div>
          <p className="mt-1 text-sm text-[#475569]">
            Echipa HIR vă răspunde în maximum 24 de ore lucrătoare.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <a
              href="tel:+40743700916"
              className="flex items-center gap-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] transition-colors hover:border-emerald-300 hover:bg-white"
            >
              <Phone className="h-4 w-4 flex-none text-emerald-500" aria-hidden />
              <span className="flex-1 truncate">+40 743 700 916</span>
              <span className="text-[10px] text-[#94A3B8]">L–V 09–18</span>
            </a>
            <a
              href="mailto:office@hirforyou.ro"
              className="flex items-center gap-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] transition-colors hover:border-[#C7D2FE] hover:bg-white"
            >
              <Mail className="h-4 w-4 flex-none text-[#4F46E5]" aria-hidden />
              <span className="flex-1 truncate">office@hirforyou.ro</span>
            </a>
          </div>
          <p className="mt-4 text-xs text-[#94A3B8]">
            Pentru probleme operative cu o comandă activă, contactați direct
            restaurantul folosind numărul de telefon din pagina de tracking.
          </p>
        </section>

        <p className="mt-6 text-center text-[11px] text-[#94A3B8]">
          Actualizat: 2026-05-05 ·{' '}
          <Link href="/privacy" className="hover:text-[#0F172A]">
            Politica de confidențialitate
          </Link>
        </p>
      </main>

      <MarketingFooter currentLocale={currentLocale} />
    </div>
  );
}
