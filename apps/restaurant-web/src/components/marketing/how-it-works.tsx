import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { t, type Locale } from '@/lib/i18n';
import { GuideShot } from './guide-shot';
import { GUIDE_STEPS } from '@/lib/marketing/guide-steps';

// Homepage teaser for the full walkthrough at /cum-functioneaza. Pulls from
// the same GUIDE_STEPS data so the two pages can never drift, but shows the
// four steps that tell the *order's* story (menu → customer orders → it lands
// on your screen → courier delivers) rather than the account-setup ones, and
// renumbers them 1-4 for display. The marketing.home.how_it_works_step*
// dictionary keys this section used are now inert, same convention as
// hero_badge — the guide's copy is the single source.
//
// 2026-08-01 — the illustrations here used to be grey CSS mockups, which read
// as loading skeletons ("arata total neprofesional" — Iulian). They're now the
// real app screenshots, shared with the guide page.

const TEASER_STEP_NUMBERS = [2, 4, 5, 6];
const TEASER_STEPS = TEASER_STEP_NUMBERS.map(
  (n) => GUIDE_STEPS.find((s) => s.n === n)!,
);

export function HowItWorks({ currentLocale }: { currentLocale: Locale }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
        {t(currentLocale, 'marketing.home.how_it_works_title')}
      </h2>

      <ol className="mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {TEASER_STEPS.map((step, i) => (
          <li key={step.n}>
            {/* Fixed-height, centred image slot: the four shots have very
                different aspect ratios (wide dashboard vs. tall phone) and
                without it the numbers and titles below wouldn't line up. */}
            <div className="flex h-[260px] items-center justify-center">
              <GuideShot
                src={step.src}
                alt={t(currentLocale, step.titleKey)}
                width={step.width}
                height={step.height}
                frame={step.frame}
                compact
              />
            </div>
            <span
              className="mt-5 flex h-9 w-9 items-center justify-center rounded-full bg-[#EEF2FF] text-base font-bold text-[#4F46E5]"
              aria-hidden
            >
              {i + 1}
            </span>
            <h3 className="mt-3 text-base font-semibold tracking-tight text-[#0F172A]">
              {t(currentLocale, step.titleKey)}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#475569]">
              {t(currentLocale, step.bodyKey)}
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-12">
        <Link
          href="/cum-functioneaza"
          className="group inline-flex items-center gap-1 rounded-md text-sm font-medium text-[#4F46E5] transition-colors hover:text-[#4338CA] focus-visible:outline-2 focus-visible:outline-[#4F46E5] focus-visible:outline-offset-2"
        >
          {t(currentLocale, 'marketing.home.value_more_link')}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
