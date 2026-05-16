import Link from 'next/link';
import { ChevronRight, HelpCircle, LifeBuoy, Mail, MessageCircle, Phone } from 'lucide-react';
import { getLocale } from '@/lib/i18n/server';
import type { Locale } from '@/lib/i18n';
import { HELP_CATEGORIES, getAllTopics, pickLocale, type L10n } from './content';
import { HelpSearch, type SearchTopic } from './help-search';

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
// in `./content.ts` and are surfaced via a static index plus per-topic
// detail pages at `[category]/[slug]`. Client-side search runs over a
// small JSON index (~26 topics) — no external dep.
//
// Locale: RO default; EN parity added 2026-05-16. The search body is built
// from BOTH locales concatenated, so an EN query like "delivery zone" hits
// the RO copy too — important during the transition when most operators
// still type in RO out of habit.
export default function HelpIndexPage() {
  const locale: Locale = getLocale();

  const pickBoth = (v: L10n): string => {
    if (typeof v === 'string') return v;
    return `${v.ro} ${v.en}`;
  };

  const searchIndex: SearchTopic[] = getAllTopics().flatMap((t) => {
    const cat = HELP_CATEGORIES.find((c) => c.topics.includes(t));
    if (!cat) return [];
    const body = [
      pickBoth(t.intro),
      ...(t.steps?.map((s) => `${pickBoth(s.title)}. ${pickBoth(s.body)}`) ?? []),
      t.outro ? pickBoth(t.outro) : '',
    ].join(' ');
    return [
      {
        slug: t.slug,
        categorySlug: cat.slug,
        categoryTitle: pickLocale(cat.title, locale),
        title: pickLocale(t.title, locale),
        // Title in BOTH locales is included for scoring so EN queries
        // still rank the right topic when only the RO title is shown.
        titleSearch: pickBoth(t.title),
        summary: pickLocale(t.summary, locale),
        summarySearch: pickBoth(t.summary),
        body,
      },
    ];
  });

  const copy = locale === 'en'
    ? {
        eyebrow: 'Help center',
        h1: 'How can we help?',
        lead: 'Step-by-step guides for every role, quick troubleshooting, and direct support access. All articles updated on 2026-05-05.',
        botTitle: 'Ask me on Telegram (Hepy)',
        botBody: 'Instant answers for quick questions about orders, stock or reports. Open the chat with the bot directly.',
        botOpen: 'Open →',
        supportH: 'Contact support',
        supportLead: 'For urgent issues or questions the guides do not cover.',
        supportHours: 'Mon–Fri 09–18',
        feedback: 'Missing a guide? Use the feedback button (bottom-right corner) to suggest a new article.',
      }
    : {
        eyebrow: 'Centru de ajutor',
        h1: 'Cum vă putem ajuta?',
        lead: 'Ghiduri pas cu pas pentru fiecare rol, troubleshooting rapid și acces direct la suport. Toate articolele sunt actualizate la 2026-05-05.',
        botTitle: 'Întreabă-mă pe Telegram (Hepy)',
        botBody: 'Răspuns instant pentru întrebări rapide despre comenzi, stocuri sau rapoarte. Deschideți chat-ul direct cu botul.',
        botOpen: 'Deschide →',
        supportH: 'Contact suport',
        supportLead: 'Pentru probleme urgente sau întrebări care nu au răspuns în ghiduri.',
        supportHours: 'L–V 09–18',
        feedback: 'Lipsește un ghid? Folosiți butonul de feedback (colț dreapta jos) pentru a ne sugera un articol nou.',
      };

  const searchPlaceholder = locale === 'en'
    ? 'Search the guides (e.g. notifications, GloriaFood, GPS)…'
    : 'Caută în ghiduri (ex: notificări, GloriaFood, GPS)…';
  const searchEmpty = locale === 'en'
    ? 'No results. Try other keywords or browse the categories below.'
    : 'Niciun rezultat. Încercați alte cuvinte sau parcurgeți categoriile de mai jos.';
  const searchAriaLabel = locale === 'en' ? 'Search the guides' : 'Caută în ghiduri';

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <HelpCircle className="h-3.5 w-3.5" aria-hidden />
          <span>{copy.eyebrow}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          {copy.h1}
        </h1>
        <p className="max-w-2xl text-sm text-zinc-600">
          {copy.lead}
        </p>
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
          <p className="text-sm font-semibold text-zinc-900">
            {copy.botTitle}
          </p>
          <p className="text-xs text-zinc-600">
            {copy.botBody}
          </p>
        </div>
        <span
          aria-hidden
          className="ml-auto self-center text-xs font-medium text-purple-700 group-hover:text-purple-900"
        >
          {copy.botOpen}
        </span>
      </a>

      <HelpSearch
        topics={searchIndex}
        placeholder={searchPlaceholder}
        emptyLabel={searchEmpty}
        ariaLabel={searchAriaLabel}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        <main className="flex flex-col gap-4">
          {HELP_CATEGORIES.map((cat) => (
            <section
              key={cat.slug}
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
              id={cat.slug}
            >
              <div className="mb-3">
                <h2 className="text-base font-semibold tracking-tight text-zinc-900">
                  {pickLocale(cat.title, locale)}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500">{pickLocale(cat.description, locale)}</p>
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
                          {pickLocale(t.title, locale)}
                        </p>
                        <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">
                          {pickLocale(t.summary, locale)}
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
              <h2 className="text-sm font-semibold text-zinc-900">{copy.supportH}</h2>
            </div>
            <p className="mt-1.5 text-xs text-zinc-500">
              {copy.supportLead}
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <a
                href="tel:+40212040000"
                className="flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 transition-colors hover:border-emerald-300 hover:bg-white"
              >
                <Phone className="h-4 w-4 flex-none text-emerald-500" aria-hidden />
                <span className="flex-1">+40 21 204 0000</span>
                <span className="text-[10px] text-zinc-400">{copy.supportHours}</span>
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
            <p className="text-[11px] leading-relaxed text-zinc-500">
              {copy.feedback}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
