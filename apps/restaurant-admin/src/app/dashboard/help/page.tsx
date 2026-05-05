import Link from 'next/link';
import { ChevronRight, HelpCircle, LifeBuoy, Mail, Phone } from 'lucide-react';
import { HELP_CATEGORIES, getAllTopics } from './content';
import { HelpSearch, type SearchTopic } from './help-search';

export const dynamic = 'force-static';
export const revalidate = 3600;

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
// small JSON index (~25 topics) — no external dep.
export default function HelpIndexPage() {
  const searchIndex: SearchTopic[] = getAllTopics().flatMap((t) => {
    const cat = HELP_CATEGORIES.find((c) => c.topics.includes(t));
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
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <HelpCircle className="h-3.5 w-3.5" aria-hidden />
          <span>Centru de ajutor</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Cum vă putem ajuta?
        </h1>
        <p className="max-w-2xl text-sm text-zinc-600">
          Ghiduri pas cu pas pentru fiecare rol, troubleshooting rapid și acces direct
          la suport. Toate articolele sunt actualizate la 2026-05-05.
        </p>
      </header>

      <HelpSearch topics={searchIndex} />

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
              <h2 className="text-sm font-semibold text-zinc-900">Contact suport</h2>
            </div>
            <p className="mt-1.5 text-xs text-zinc-500">
              Pentru probleme urgente sau întrebări care nu au răspuns în ghiduri.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <a
                href="tel:+40212040000"
                className="flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 transition-colors hover:border-emerald-300 hover:bg-white"
              >
                <Phone className="h-4 w-4 flex-none text-emerald-500" aria-hidden />
                <span className="flex-1">+40 21 204 0000</span>
                <span className="text-[10px] text-zinc-400">L–V 09–18</span>
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
              Lipsește un ghid? Folosiți butonul de feedback (colț dreapta jos)
              pentru a ne sugera un articol nou.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
