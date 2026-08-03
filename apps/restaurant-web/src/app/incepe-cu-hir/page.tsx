import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import {
  MarketingHeader,
  MarketingFooter,
} from '@/components/marketing/marketing-shell';
import { getLocale } from '@/lib/i18n/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 2026-08-03 — this page used to be a fork: "Mă descurc singur / Cont creat în
// 5 minute / înscriere instantă, fără card" on one side, "Vreau să mă ajutați"
// on the other, with the first going straight to admin's /signup.
//
// That fork no longer exists. Iulian onboards every restaurant himself
// ("oricum toate onboardingurile vor fi facute personal de mine"), so the
// self-serve half advertised a route nobody is meant to take — and the "cont
// demo gratuit / 30 zile" language it carried is exactly what he asked to have
// reworded. The page keeps its URL and its place in the flow; it now describes
// what actually happens, in three steps, with one way forward.

export const metadata: Metadata = {
  title: 'Începe cu HIR — îți deschidem contul împreună',
  description:
    'Nu completezi formulare singur. Vorbim 15 minute, înțelegem ce ai nevoie și îți configurăm contul, meniul și livrarea.',
  robots: { index: false, follow: true },
};

type Step = { title: string; body: string };
type Copy = {
  back: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  steps: Step[];
  cta: string;
  hint: string;
  footnote: string;
  demoLink: string;
};

const RO: Copy = {
  back: 'Înapoi la conectare',
  eyebrow: 'Cum începem',
  title: 'Îți deschidem contul împreună',
  subtitle:
    'Nu ai de completat nimic singur și nu ai nevoie de card. Ne spui ce vinzi și de unde, restul facem noi.',
  steps: [
    {
      title: 'Vorbim 15 minute',
      body: 'Ne spui ce fel de local ai, ce livrezi și în ce zonă. Atât — nu e un interviu de vânzări.',
    },
    {
      title: 'Îți configurăm contul',
      body: 'Meniu, poze, zone de livrare, program și plăți. Dacă ai deja meniul în GloriaFood, WooCommerce sau într-un fișier, îl aducem noi.',
    },
    {
      title: 'Îl vezi înainte să pornească',
      body: 'Îți arătăm magazinul gata făcut și îl pornim doar când ești mulțumit de el.',
    },
  ],
  cta: 'Hai să vorbim',
  hint: 'Fără card · fără abonament · fără comision pe comandă',
  footnote: 'Vrei să vezi întâi cum arată pentru clientul tău?',
  demoLink: 'Deschide demoul interactiv',
};

const EN: Copy = {
  back: 'Back to sign in',
  eyebrow: 'How we start',
  title: 'We open the account with you',
  subtitle:
    "There's nothing for you to fill in on your own, and no card needed. Tell us what you sell and where, and we do the rest.",
  steps: [
    {
      title: 'A 15-minute call',
      body: "You tell us what kind of place you run, what you deliver and where. That's it — this isn't a sales interview.",
    },
    {
      title: 'We set the account up',
      body: 'Menu, photos, delivery zones, opening hours and payments. If your menu already lives in GloriaFood, WooCommerce or a file, we bring it over.',
    },
    {
      title: 'You see it before it goes live',
      body: "We show you the finished shop and switch it on only once you're happy with it.",
    },
  ],
  cta: "Let's talk",
  hint: 'No card · no subscription · no per-order commission',
  footnote: 'Want to see what it looks like for your customer first?',
  demoLink: 'Open the interactive demo',
};

export default async function IncepeCuHirPage() {
  const currentLocale = await getLocale();
  const c = currentLocale === 'en' ? EN : RO;

  return (
    <>
      <MarketingHeader active="/intra-in-cont" currentLocale={currentLocale} />
      <main id="main-content" className="bg-[#F8FAFC]">
        <section className="mx-auto max-w-3xl px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
          <Link
            href="/intra-in-cont"
            className="inline-flex items-center gap-1.5 text-sm text-[#475569] hover:text-[#0F172A]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {c.back}
          </Link>

          <div className="mt-6 text-center">
            <span className="inline-flex items-center rounded-full border border-[#C7D2FE] bg-[#EEF2FF] px-3 py-1 text-xs font-semibold text-[#4338CA]">
              {c.eyebrow}
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
              {c.title}
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-base text-[#475569]">{c.subtitle}</p>
          </div>

          <ol className="mt-10 space-y-4">
            {c.steps.map((s, i) => (
              <li
                key={s.title}
                className="flex gap-4 rounded-2xl border border-[#E2E8F0] bg-white p-5"
              >
                <span
                  aria-hidden
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#EEF2FF] text-sm font-bold text-[#4338CA]"
                >
                  {i + 1}
                </span>
                <div>
                  <h2 className="text-base font-semibold text-[#0F172A]">{s.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-[#475569]">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-8 text-center">
            <Link
              href="/contact?source=onboarding"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[#4F46E5] px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-inset ring-[#4338CA] transition-colors hover:bg-[#4338CA]"
            >
              {c.cta}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <p className="mt-3 text-xs text-[#94A3B8]">{c.hint}</p>
          </div>

          <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-[#64748B]">
            {c.footnote}{' '}
            <Link href="/demo-storefront" className="font-medium text-[#4338CA] hover:underline">
              {c.demoLink}
            </Link>
            .
          </p>
        </section>
      </main>
      <MarketingFooter currentLocale={currentLocale} />
    </>
  );
}
