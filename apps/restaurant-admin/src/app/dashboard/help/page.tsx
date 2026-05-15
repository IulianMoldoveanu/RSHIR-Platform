import Link from 'next/link';
import { ChevronRight, HelpCircle, LifeBuoy, Mail, MessageCircle, Phone } from 'lucide-react';
import {
  getLocalizedAllTopics,
  getLocalizedCategories,
  getHelpUi,
} from './content-localized';
import { HelpSearch, type SearchTopic } from './help-search';
import { HelpLanguageToggle } from './language-toggle';
import { getHelpLocale } from '@/lib/i18n/help-locale';

// QW6 (UIUX audit 2026-05-08) — Hepy bot deep-link.
//
// Bot username is configurable via NEXT_PUBLIC_HEPY_BOT_USERNAME with the
// same default the /dashboard/settings/hepy server action uses, so the two
// surfaces stay in lockstep. Deep link uses the `start` param so Telegram
// opens directly into the bot conversation; a generic `help` argument
// signals the user came in from the help center (safe to log; no PII).
const HEPY_BOT_USERNAME = process.env.NEXT_PUBLIC_HEPY_BOT_USERNAME ?? 'MasterHIRbot';
const HEPY_DEEP_LINK = `https://t.me/${HEPY_BOT_USERNAME}?start=help`;

export const metadata = {
  title: 'Centru de ajutor · HIR',
  description:
    'Ghiduri pas cu pas pentru proprietari, manageri flotă, curieri și parteneri HIR.',
};

// Help center — role-based topic tree.
//
// Pure documentation page: no schema reads, no business logic. Topics live
// in `./content.ts` (canonical RO) with EN overlay in `./content.en.ts`,
// merged via `./content-localized.ts`. Active locale is resolved from the
// `hir_locale` cookie (set by the language toggle) with Accept-Language
// fallback.
export default function HelpIndexPage() {
  const locale = getHelpLocale();
  const ui = getHelpUi(locale);
  const categories = getLocalizedCategories(locale);

  const searchIndex: SearchTopic[] = getLocalizedAllTopics(locale).flatMap((t) => {
    const cat = categories.find((c) => c.topics.some((x) => x.slug === t.slug));
    if (!cat) return [];
    const body = [
      t.intro,
      ...(t.steps?.map((s) => `${s.title}. ${s.body}`) ?? []),
      t.outro ?? '',
    ].join(' ');
    return [
      {
        slug: t.slug,
        categorySlug: cat.slug,
        categoryTitle: cat.title,
        title: t.title,
        summary: t.summary,
        body,
      },
    ];
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <HelpCircle className="h-3.5 w-3.5" aria-hidden />
            <span>{ui.eyebrow}</span>
          </div>
          <HelpLanguageToggle
            locale={locale}
            labels={{
              langToggleLabel: ui.langToggleLabel,
              langRomanian: ui.langRomanian,
              langEnglish: ui.langEnglish,
            }}
          />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          {ui.pageTitleQuestion}
        </h1>
        <p className="max-w-2xl text-sm text-zinc-600">{ui.pageDescription}</p>
      </header>

      {/* QW6 — bot CTA above the search box. Mobile users can DM Hepy
          directly from help; desktop users stay on the help index but get
          a fast-path for "I'd rather just ask". */}
      <a
        href={HEPY_DEEP_LINK}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-start gap-3 rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 via-white to-white p-4 transition-shadow hover:shadow-sm"
      >
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-purple-600 text-white">
          <MessageCircle className="h-4 w-4" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-sm font-semibold text-zinc-900">{ui.hepyCardTitle}</p>
          <p className="text-xs text-zinc-600">{ui.hepyCardBody}</p>
        </div>
        <span
          aria-hidden
          className="ml-auto self-center text-xs font-medium text-purple-700 group-hover:text-purple-900"
        >
          {ui.hepyCardOpen}
        </span>
      </a>

      <HelpSearch
        topics={searchIndex}
        strings={{
          placeholder: ui.searchPlaceholder,
          noResults: ui.searchNoResults,
          ariaLabel: ui.searchAriaLabel,
        }}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        <main className="flex flex-col gap-4">
          {categories.map((cat) => (
            <section
              key={cat.slug}
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
              id={cat.slug}
            >
              <div className="mb-3">
                <h2 className="text-base font-semibold tracking-tight text-zinc-900">
                  {cat.title}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500">{cat.description}</p>
              </div>
              <ul className="divide-y divide-zinc-100">
                {cat.topics.map((t) => (
                  <li key={t.slug}>
                    <Link
                      href={`/dashboard/help/${cat.slug}/${t.slug}`}
                      className="group flex items-start justify-between gap-3 py-2.5 transition-colors hover:bg-zinc-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-900 group-hover:text-purple-700">
                          {t.title}
                        </p>
                        <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">
                          {t.summary}
                        </p>
                      </div>
                      <ChevronRight
                        className="mt-1 h-4 w-4 flex-none text-zinc-300 group-hover:text-purple-500"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </main>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <LifeBuoy className="h-4 w-4 text-purple-600" aria-hidden />
              <h2 className="text-sm font-semibold text-zinc-900">{ui.contactTitle}</h2>
            </div>
            <p className="mt-1.5 text-xs text-zinc-500">{ui.contactBody}</p>
            <div className="mt-3 flex flex-col gap-2">
              <a
                href="tel:+40212040000"
                className="flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 transition-colors hover:border-emerald-300 hover:bg-white"
              >
                <Phone className="h-4 w-4 flex-none text-emerald-500" aria-hidden />
                <span className="flex-1">+40 21 204 0000</span>
                <span className="text-[10px] text-zinc-400">{ui.contactHours}</span>
              </a>
              <a
                href="mailto:suport@hirforyou.ro"
                className="flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 transition-colors hover:border-purple-300 hover:bg-white"
              >
                <Mail className="h-4 w-4 flex-none text-purple-500" aria-hidden />
                <span className="flex-1">suport@hirforyou.ro</span>
              </a>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-[11px] leading-relaxed text-zinc-500">{ui.feedbackHint}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
