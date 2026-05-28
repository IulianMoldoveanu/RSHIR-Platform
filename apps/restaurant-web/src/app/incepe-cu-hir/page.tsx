import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Rocket, PhoneCall, CheckCircle2, ArrowLeft } from 'lucide-react';
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
  title: 'Începe cu HIR — alege cum vrei să-ți deschizi contul',
  description:
    'Două variante simple: te înscrii singur în 5 minute sau ne contactezi și te conectăm noi pas cu pas.',
  robots: { index: false, follow: true },
};

type Copy = {
  back: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  selfTitle: string;
  selfBody: string;
  selfCta: string;
  selfBullets: string[];
  helpTitle: string;
  helpBody: string;
  helpCta: string;
  helpBullets: string[];
  footnote: string;
};

const RO: Copy = {
  back: 'Înapoi la conectare',
  eyebrow: 'Cum vrei să începi',
  title: 'Alege cum îți deschizi contul',
  subtitle:
    'Două variante. Niciuna nu costă nimic. Alege ce ți se potrivește — poți schimba oricând.',
  selfTitle: 'Mă descurc singur',
  selfBody:
    'Cont creat în 5 minute. Completezi câteva date despre restaurant și ești live azi. Importăm meniul GloriaFood automat dacă vrei.',
  selfCta: 'Creează contul acum',
  selfBullets: [
    'Înscriere instantă, fără card',
    '30 zile demo gratuite',
    'Importer meniu GloriaFood inclus',
  ],
  helpTitle: 'Vreau să mă ajutați',
  helpBody:
    'Te sunăm noi sau ne dai un telefon. 15 minute, în limba română. Înțelegem ce vrei și îți configurăm contul împreună.',
  helpCta: 'Contactați-mă',
  helpBullets: [
    'Apel scurt cu un consultant HIR',
    'Configurăm meniul și livrarea împreună',
    'Echipă reală din București și Brașov',
  ],
  footnote:
    'Indiferent ce alegi, ești pe aceeași platformă. Niciun comision pe comandă, niciun obiectiv minim.',
};

const EN: Copy = {
  back: 'Back to sign in',
  eyebrow: 'How would you like to start',
  title: 'Pick how you open your account',
  subtitle:
    "Two options. Neither costs you anything. Pick what fits — you can switch anytime.",
  selfTitle: "I'll do it myself",
  selfBody:
    'Account in 5 minutes. Fill in a few details about the restaurant and you go live today. We import your GloriaFood menu automatically if you want.',
  selfCta: 'Create the account now',
  selfBullets: [
    'Instant signup, no card',
    '30-day free demo',
    'GloriaFood menu importer included',
  ],
  helpTitle: 'I want you to help',
  helpBody:
    'We call you or you call us. 15 minutes, in Romanian or English. We understand what you need and set up the account together.',
  helpCta: 'Contact me',
  helpBullets: [
    'Short call with a HIR consultant',
    'We set up menu and delivery together',
    'Real team in Bucharest and Brașov',
  ],
  footnote:
    'Either way, you are on the same platform. No per-order commission, no minimum targets.',
};

export default async function IncepeCuHirPage() {
  const currentLocale = await getLocale();
  const c = currentLocale === 'en' ? EN : RO;

  return (
    <>
      <MarketingHeader active="/intra-in-cont" currentLocale={currentLocale} />
      <main id="main-content" className="bg-[#F8FAFC]">
        <section className="mx-auto max-w-5xl px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
          <div>
            <Link
              href="/intra-in-cont"
              className="inline-flex items-center gap-1.5 text-sm text-[#475569] hover:text-[#0F172A]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {c.back}
            </Link>
          </div>

          <div className="mt-6 text-center">
            <span className="inline-flex items-center rounded-full border border-[#C7D2FE] bg-[#EEF2FF] px-3 py-1 text-xs font-semibold text-[#4338CA]">
              {c.eyebrow}
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
              {c.title}
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base text-[#475569]">{c.subtitle}</p>
          </div>

          <div className="mt-10 grid gap-5 sm:mt-12 md:grid-cols-2">
            <ChoiceCard
              tone="primary"
              icon={<Rocket className="h-5 w-5" aria-hidden />}
              title={c.selfTitle}
              body={c.selfBody}
              cta={c.selfCta}
              bullets={c.selfBullets}
              href={`${ADMIN_URL}/signup`}
              external
            />
            <ChoiceCard
              tone="ghost"
              icon={<PhoneCall className="h-5 w-5" aria-hidden />}
              title={c.helpTitle}
              body={c.helpBody}
              cta={c.helpCta}
              bullets={c.helpBullets}
              href="/contact?source=onboarding"
            />
          </div>

          <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-[#64748B]">
            {c.footnote}
          </p>
        </section>
      </main>
      <MarketingFooter currentLocale={currentLocale} />
    </>
  );
}

function ChoiceCard({
  tone,
  icon,
  title,
  body,
  cta,
  bullets,
  href,
  external,
}: {
  tone: 'primary' | 'ghost';
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: string;
  bullets: string[];
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
      <p className="mt-2 text-sm leading-relaxed text-[#475569]">{body}</p>
      <ul className="mt-4 space-y-2">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm text-[#334155]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-[#059669]" aria-hidden />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto">
        {external ? (
          <a href={href} rel="noopener">
            {ctaEl}
          </a>
        ) : (
          <Link href={href}>{ctaEl}</Link>
        )}
      </div>
    </div>
  );
}
