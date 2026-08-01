import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { t, type Locale, type TKey } from '@/lib/i18n';

// Four numbered steps, replacing the old four-column value-props grid.
// 2026-08-01, Iulian: the site read as "sec ... prea sofisticat" next to a
// competitor whose homepage just walks you through what happens. Running both
// a feature grid AND a steps section would defeat the point ("extrem de
// simplu"), so this supersedes the grid rather than sitting beside it.

// Keys listed explicitly rather than built by string interpolation so a typo
// or a missing dictionary entry is a compile error, not a runtime blank.
const STEPS: Array<{ n: number; titleKey: TKey; bodyKey: TKey }> = [
  {
    n: 1,
    titleKey: 'marketing.home.how_it_works_step1_title',
    bodyKey: 'marketing.home.how_it_works_step1_body',
  },
  {
    n: 2,
    titleKey: 'marketing.home.how_it_works_step2_title',
    bodyKey: 'marketing.home.how_it_works_step2_body',
  },
  {
    n: 3,
    titleKey: 'marketing.home.how_it_works_step3_title',
    bodyKey: 'marketing.home.how_it_works_step3_body',
  },
  {
    n: 4,
    titleKey: 'marketing.home.how_it_works_step4_title',
    bodyKey: 'marketing.home.how_it_works_step4_body',
  },
];

export function HowItWorks({ currentLocale }: { currentLocale: Locale }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
        {t(currentLocale, 'marketing.home.how_it_works_title')}
      </h2>
      <p className="mt-3 max-w-2xl text-base text-[#475569]">
        {t(currentLocale, 'marketing.home.how_it_works_intro')}
      </p>

      <ol className="mt-12 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step) => (
          <li key={step.n}>
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF2FF] text-xl font-bold text-[#4F46E5]"
              aria-hidden
            >
              {step.n}
            </span>
            <h3 className="mt-4 text-base font-semibold tracking-tight text-[#0F172A]">
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
          href="/features"
          className="group inline-flex items-center gap-1 rounded-md text-sm font-medium text-[#4F46E5] transition-colors hover:text-[#4338CA] focus-visible:outline-2 focus-visible:outline-[#4F46E5] focus-visible:outline-offset-2"
        >
          {t(currentLocale, 'marketing.home.value_more_link')}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
