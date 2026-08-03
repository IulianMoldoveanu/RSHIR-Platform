import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, LogIn, UserPlus } from 'lucide-react';
import {
  MarketingHeader,
  MarketingFooter,
} from '@/components/marketing/marketing-shell';
import { getLocale } from '@/lib/i18n/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_URL =
  process.env.NEXT_PUBLIC_RESTAURANT_ADMIN_URL ?? 'https://hir-restaurant-admin.vercel.app';

export const metadata: Metadata = {
  title: 'Conectează-te sau creează cont — HIR',
  description:
    'Intră în contul HIR pentru a-ți gestiona comenzile, livrările și restaurantul. Sau creează un cont nou în mai puțin de 5 minute.',
  robots: { index: false, follow: true },
};

type Copy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  loginTitle: string;
  loginBody: string;
  loginCta: string;
  loginHint: string;
  signupTitle: string;
  signupBody: string;
  signupCta: string;
  signupHint: string;
  helpPrefix: string;
  helpLink: string;
};

// 2026-08-03 — the sign-up side no longer promises self-service. Iulian sets up
// every restaurant himself ("toate onboardingurile vor fi facute personal de
// mine"), so "creează cont demo gratuit / te înscrii rapid de unul singur / 5
// minute" was describing a path that doesn't exist. It now says what actually
// happens: we talk, then we set the account up together. The "De ce să ai cont
// HIR" block that sat under these two cards is gone at his request — it was
// selling an account to someone who has already come here to get one.
const RO: Copy = {
  eyebrow: 'Cont HIR',
  title: 'Bine ai venit. Cum vrei să continui?',
  subtitle: 'Intră în cont dacă ai deja unul. Dacă nu, ți-l deschidem noi.',
  loginTitle: 'Am deja cont',
  loginBody:
    'Conectează-te cu emailul și parola pentru a vedea comenzile, livrările și setările restaurantului tău.',
  loginCta: 'Conectează-te',
  loginHint: 'Acces sigur prin admin.hirforyou.ro',
  signupTitle: 'Vreau cont',
  signupBody:
    'Nu completezi nimic singur. Ne spui câteva lucruri despre restaurant, iar noi îți configurăm contul și meniul împreună cu tine.',
  signupCta: 'Hai să vorbim',
  signupHint: 'Fără card · fără abonament',
  helpPrefix: 'Ai nevoie de ajutor?',
  helpLink: 'Scrie-ne pe contact',
};

const EN: Copy = {
  eyebrow: 'HIR account',
  title: 'Welcome back. How would you like to continue?',
  subtitle: "Sign in if you already have an account. If you don't, we'll open one for you.",
  loginTitle: 'I already have an account',
  loginBody:
    'Sign in with your email and password to see your orders, deliveries and restaurant settings.',
  loginCta: 'Log in',
  loginHint: 'Secure access via admin.hirforyou.ro',
  signupTitle: 'I want an account',
  signupBody:
    'Nothing to fill in on your own. Tell us a few things about your restaurant and we set the account and the menu up together with you.',
  signupCta: "Let's talk",
  signupHint: 'No card · no subscription',
  helpPrefix: 'Need help?',
  helpLink: 'Contact us',
};

export default async function IntraInContPage() {
  const currentLocale = await getLocale();
  const c = currentLocale === 'en' ? EN : RO;

  return (
    <>
      <MarketingHeader active="/intra-in-cont" currentLocale={currentLocale} />
      <main id="main-content" className="bg-[#F8FAFC]">
        <section className="mx-auto max-w-5xl px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
          <div className="text-center">
            <span className="inline-flex items-center rounded-full border border-[#C7D2FE] bg-[#EEF2FF] px-3 py-1 text-xs font-semibold text-[#4338CA]">
              {c.eyebrow}
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
              {c.title}
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base text-[#475569]">
              {c.subtitle}
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:mt-12 md:grid-cols-2">
            <AuthCard
              tone="primary"
              icon={<LogIn className="h-5 w-5" aria-hidden />}
              title={c.loginTitle}
              body={c.loginBody}
              cta={c.loginCta}
              hint={c.loginHint}
              href={`${ADMIN_URL}/login`}
              external
            />
            <AuthCard
              tone="ghost"
              icon={<UserPlus className="h-5 w-5" aria-hidden />}
              title={c.signupTitle}
              body={c.signupBody}
              cta={c.signupCta}
              hint={c.signupHint}
              // Straight to /contact now, not through the "do it yourself or
              // let us help?" fork — there is only one path, and it's us.
              href="/contact"
            />
          </div>

          <p className="mt-10 text-center text-sm text-[#64748B]">
            {c.helpPrefix}{' '}
            <Link href="/contact" className="font-medium text-[#4338CA] hover:underline">
              {c.helpLink}
            </Link>
            .
          </p>
        </section>
      </main>
      <MarketingFooter currentLocale={currentLocale} />
    </>
  );
}

function AuthCard({
  tone,
  icon,
  title,
  body,
  cta,
  hint,
  href,
  external,
}: {
  tone: 'primary' | 'ghost';
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: string;
  hint: string;
  href: string;
  external?: boolean;
}) {
  const isPrimary = tone === 'primary';
  const ctaClasses = isPrimary
    ? 'bg-[#4F46E5] text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA]'
    : 'bg-[#0F172A] text-white hover:bg-[#1E293B]';
  const iconWrap = isPrimary
    ? 'bg-[#EEF2FF] text-[#4338CA]'
    : 'bg-[#F1F5F9] text-[#0F172A]';

  const ctaEl = (
    <span
      className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors ${ctaClasses}`}
    >
      {cta}
      <ArrowRight className="h-4 w-4" aria-hidden />
    </span>
  );

  return (
    <div className="flex h-full flex-col rounded-2xl border border-[#E2E8F0] bg-white p-6 transition-shadow hover:shadow-sm">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconWrap}`}>
        {icon}
      </div>
      <h2 className="mt-4 text-lg font-semibold text-[#0F172A]">{title}</h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-[#475569]">{body}</p>
      {external ? (
        <a href={href} rel="noopener">
          {ctaEl}
        </a>
      ) : (
        <Link href={href}>{ctaEl}</Link>
      )}
      <p className="mt-3 text-center text-xs text-[#94A3B8]">{hint}</p>
    </div>
  );
}
