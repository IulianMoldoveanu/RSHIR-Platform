// /parteneriat/inscriere — self-service partner signup landing.
//
// Improved version of /affiliate that doubles as a signup screen: in addition
// to the audience intake fields (kept identical to /affiliate), it asks for
// email + password, creating a Supabase auth user + PENDING partners row +
// affiliate_applications row in one POST. After submit, the partner can log
// in to /partner-portal (admin host) and immediately share their /r/<code>
// link, even before admin approval.
//
// /affiliate is kept as the marketing-only entry point (no signup) for
// inbound traffic that prefers a lighter intake. /parteneriat/inscriere is
// linked from the new /r/<code> CTA + future "Devino partener HIR" surfaces.

import type { Metadata } from 'next';
import { SignupForm } from './signup-form';
import { marketingOgImageUrl } from '@/lib/seo-marketing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OG_IMAGE = marketingOgImageUrl({
  title: 'Devino reseller HIRforYOU — comision 25% Y1, 20% recurring',
  subtitle: 'Cont, cod de referral și link personal după primul submit.',
  variant: 'partner',
});

export const metadata: Metadata = {
  title: 'Devino reseller HIRforYOU — termeni preferențiali pentru reseleri activi',
  description:
    'Înscrie-te ca reseller HIRforYOU și primește instant codul tău de referral + linkul personal. Programul de revenue share (25% Y1 / 20% recurring) este în roll-out activ — termenii finali se confirmă la aprobarea echipei și semnarea contractului.',
  openGraph: {
    title: 'Devino reseller HIRforYOU',
    description:
      'Cont, cod de referral și link personal în 2 minute. 25% Y1 / 20% recurring din MRR.',
    type: 'website',
    locale: 'ro_RO',
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'Devino reseller HIRforYOU' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Devino reseller HIRforYOU',
    description: 'Link-ul tău de referral în 2 minute.',
    images: [OG_IMAGE],
  },
  robots: { index: true, follow: true },
};

const ADMIN_URL =
  process.env.NEXT_PUBLIC_RESTAURANT_ADMIN_URL ?? 'https://hir-restaurant-admin.vercel.app';

export default function PartnerSignupPage() {
  return (
    <main
      className="min-h-screen bg-[#FAFAFA] text-[#0F172A]"
      style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
    >
      {/* Hero */}
      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-3xl px-6 py-16 md:py-20">
          <div className="mb-3 inline-flex items-center rounded-md bg-[#EEF2FF] px-2.5 py-1 text-xs font-medium text-[#4F46E5] ring-1 ring-inset ring-[#C7D2FE]">
            HIRforYOU Reseller Program
          </div>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            Devino reseller HIRforYOU. Primește instant linkul tău personal.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-[#475569]">
            Înscrie-te în 2 minute. După trimitere, ai imediat acces la portal-ul de
            reseller cu linkul tău unic — îl poți distribui pe loc pe WhatsApp, Telegram
            sau email. Echipa HIRforYOU aprobă cererea în maxim 24h pentru activarea
            comisionului.
          </p>
          <div className="mt-6 inline-flex flex-wrap items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <span>Program reseller: 25% Y1 · 20% recurring</span>
            <span aria-hidden className="text-emerald-300">·</span>
            <span className="font-normal text-emerald-600">termeni finali la aprobare</span>
          </div>
        </div>
      </section>

      {/* What you get + how it works */}
      <section className="mx-auto max-w-3xl px-6 py-12">
        <div className="grid gap-6 md:grid-cols-3">
          <Step
            n="1"
            title="Te înscrii"
            body="Email + parolă + scurtă descriere a profilului tău. Confirmi emailul."
          />
          <Step
            n="2"
            title="Primești codul tău de referral"
            body="După aprobare, primești codul tău unic de referral și linkul /r/<COD> cu butoane share — îl folosești instant pentru WhatsApp, Telegram sau email."
          />
          <Step
            n="3"
            title="Termeni preferențiali pentru reseleri activi"
            body="După aprobare și semnarea contractului de parteneriat, echipa HIRforYOU îți confirmă termenii finali — programul țintă este 25% în primul an și 20% recurring din MRR-ul restaurantelor aduse."
          />
        </div>
      </section>

      {/* Reseller details */}
      <section className="mx-auto max-w-3xl px-6 pb-4">
        <div className="rounded-lg border border-[#E2E8F0] bg-white p-6">
          <h2 className="text-lg font-semibold text-[#0F172A]">Cum funcționează</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-[#475569]">
            <li><strong className="text-[#0F172A]">Comision:</strong> 25% din MRR în primii 12 luni, 20% recurring după (termenii finali confirmați la semnarea contractului).</li>
            <li><strong className="text-[#0F172A]">Plată:</strong> trimestrial, pe factură PFA / SRL (necesar CIF).</li>
            <li><strong className="text-[#0F172A]">Aprobare:</strong> review manual în 24h de la submit, apoi activăm codul tău de referral.</li>
            <li><strong className="text-[#0F172A]">Materiale:</strong> deck PDF de prezentare, link <a href="/migrate-from-gloriafood" className="text-[#4F46E5] hover:underline">/migrate-from-gloriafood</a> ca leadgen tool, studii de caz live (<a href="/case-studies/foisorul-a" className="text-[#4F46E5] hover:underline">Foișorul A</a>).</li>
            <li><strong className="text-[#0F172A]">Suport:</strong> răspundem direct, nu printr-un call center.</li>
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-[#94A3B8]">
            Notă: Programul de revenue share recurring este în roll-out activ. Resellerii aprobați
            în această etapă semnează un contract individualizat cu echipa HIRforYOU; termenii
            preliminari (25% Y1 / 20% recurring) sunt referința de bază a programului.
          </p>
        </div>
      </section>

      {/* Form */}
      <section id="aplica" className="mx-auto max-w-2xl px-6 pb-16 pt-8">
        <h2 className="mb-2 text-xl font-semibold tracking-tight">Înscrie-te</h2>
        <p className="mb-6 text-sm text-[#475569]">
          Toate câmpurile marcate cu * sunt obligatorii. După trimitere te poți loga imediat
          în portal — comisionul devine activ după aprobarea echipei HIRforYOU (24h).
        </p>
        <div className="rounded-lg border border-[#E2E8F0] bg-white p-6">
          <SignupForm adminUrl={ADMIN_URL} />
        </div>
        <p className="mt-6 text-center text-sm text-[#475569]">
          Întrebări înainte de înscriere? Sună-ne la{' '}
          <a href="tel:+40743700916" className="font-medium text-[#4F46E5] hover:underline">
            +40 743 700 916
          </a>{' '}
          sau scrie la{' '}
          <a href="mailto:office@hirforyou.ro" className="font-medium text-[#4F46E5] hover:underline">
            office@hirforyou.ro
          </a>
          .
        </p>
      </section>

      <footer className="border-t border-[#E2E8F0] py-8 text-center text-xs text-[#94a3b8]">
        Ai deja cont de reseller?{' '}
        <a
          href={`${ADMIN_URL}/login`}
          className="text-[#4F46E5] hover:underline"
        >
          Loghează-te aici
        </a>
        <div className="mt-2">HIRforYOU · {new Date().getFullYear()}</div>
      </footer>
    </main>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-5">
      <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-md bg-[#EEF2FF] text-xs font-semibold text-[#4F46E5]">
        {n}
      </div>
      <h3 className="text-sm font-semibold text-[#0F172A]">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-[#475569]">{body}</p>
    </div>
  );
}
