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

import { SignupForm } from './signup-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Devino partener HIR — primește link-ul tău în 2 minute',
  description:
    'Înscrie-te ca partener HIR și primește instant codul tău de afiliat + linkul personal. Câștigi 300 RON pentru fiecare restaurant onboarded prin link (600 RON dacă deja ai cont HIR).',
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
            HIR Partner Program
          </div>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            Devino partener HIR. Primește instant linkul tău personal.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-[#475569]">
            Înscrie-te în 2 minute. După trimitere, ai imediat acces la dashboard-ul de
            partener cu linkul tău unic — îl poți distribui pe loc pe WhatsApp, Telegram
            sau email. Echipa HIR aprobă cererea în maxim 24h pentru activarea plăților.
          </p>
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
            title="Primești linkul tău"
            body="Logare instant în /partner-portal cu linkul tău /r/<COD> și butoane share."
          />
          <Step
            n="3"
            title="Câștigi 300-600 RON / restaurant"
            body="După aprobare (24h), comisionul curge pentru fiecare restaurant onboarded prin link."
          />
        </div>
      </section>

      {/* Form */}
      <section id="aplica" className="mx-auto max-w-2xl px-6 pb-16">
        <h2 className="mb-2 text-xl font-semibold tracking-tight">Înscrie-te</h2>
        <p className="mb-6 text-sm text-[#475569]">
          Toate câmpurile marcate cu * sunt obligatorii. După trimitere, vei primi un email
          de confirmare. Confirmă-l, apoi te poți loga în portal.
        </p>
        <div className="rounded-lg border border-[#E2E8F0] bg-white p-6">
          <SignupForm adminUrl={ADMIN_URL} />
        </div>
      </section>

      <footer className="border-t border-[#E2E8F0] py-8 text-center text-xs text-[#94a3b8]">
        Ai deja cont de partener?{' '}
        <a
          href={`${ADMIN_URL}/login`}
          className="text-[#4F46E5] hover:underline"
        >
          Loghează-te aici
        </a>
        <div className="mt-2">HIR Restaurant Suite · {new Date().getFullYear()}</div>
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
