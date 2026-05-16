import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, Calendar, ChevronRight } from 'lucide-react';
import { getLocale } from '@/lib/i18n/server';
import {
  findTopic,
  pickLocale,
  type HelpCategory,
  type HelpStep,
  type HelpTopic,
} from '../../content';

export const dynamic = 'force-dynamic';

export async function generateMetadata(
  props: {
    params: Promise<{ category: string; slug: string }>;
  }
) {
  const params = await props.params;
  const found = findTopic(params.slug);
  if (!found) return { title: 'Articol indisponibil · HIR' };
  const locale = getLocale();
  return {
    title: `${pickLocale(found.topic.title, locale)} · HIR`,
    description: pickLocale(found.topic.summary, locale),
  };
}

export default async function HelpTopicPage(
  props: {
    params: Promise<{ category: string; slug: string }>;
  }
) {
  const params = await props.params;
  const found = findTopic(params.slug);
  if (!found || found.category.slug !== params.category) {
    notFound();
    // notFound() returns `never`, but the explicit return below keeps the
    // typechecker happy in environments where next/navigation types are not
    // resolved (CI, partial installs).
    return null;
  }
  const topic: HelpTopic = found.topic;
  const category: HelpCategory = found.category;
  const locale = getLocale();

  const related: { topic: HelpTopic; category: HelpCategory }[] = (topic.related ?? [])
    .map((s: string) => findTopic(s))
    .filter(
      (x: ReturnType<typeof findTopic>): x is { topic: HelpTopic; category: HelpCategory } =>
        x !== null,
    );

  const labels = locale === 'en'
    ? {
        crumbHome: 'Help',
        updated: 'Updated',
        related: 'See also',
        back: 'Back to help center',
        screenshot: 'SCREENSHOT',
      }
    : {
        crumbHome: 'Ajutor',
        updated: 'Actualizat',
        related: 'Vezi și',
        back: 'Înapoi la centrul de ajutor',
        screenshot: 'SCREENSHOT',
      };

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6">
      <nav className="flex items-center gap-1 text-xs text-zinc-500">
        <Link href="/dashboard/help" className="hover:text-zinc-900">
          {labels.crumbHome}
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden />
        <Link
          href={`/dashboard/help#${category.slug}`}
          className="hover:text-zinc-900"
        >
          {pickLocale(category.title, locale)}
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden />
        <span className="truncate text-zinc-700">{pickLocale(topic.title, locale)}</span>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          {pickLocale(topic.title, locale)}
        </h1>
        <p className="text-sm text-zinc-600">{pickLocale(topic.summary, locale)}</p>
        <div className="flex items-center gap-1 text-[11px] text-zinc-400">
          <Calendar className="h-3 w-3" aria-hidden />
          <span>{labels.updated}: {topic.updated}</span>
        </div>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-sm leading-relaxed text-zinc-700">{pickLocale(topic.intro, locale)}</p>

        {topic.steps && topic.steps.length > 0 && (
          <ol className="mt-4 flex flex-col gap-2.5">
            {topic.steps.map((s: HelpStep, i: number) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-lg border border-zinc-100 bg-zinc-50 p-3"
              >
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-purple-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900">{pickLocale(s.title, locale)}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-600">
                    {pickLocale(s.body, locale)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}

        {topic.screenshot && (
          <div
            role="img"
            aria-label={pickLocale(topic.screenshot, locale)}
            className="mt-4 flex aspect-video items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 text-center text-[11px] text-zinc-400"
          >
            <span className="px-4">{labels.screenshot}: {pickLocale(topic.screenshot, locale)}</span>
          </div>
        )}

        {topic.outro && (
          <p className="mt-4 text-sm leading-relaxed text-zinc-700">{pickLocale(topic.outro, locale)}</p>
        )}

        {topic.cta && (
          <div className="mt-5">
            <Link
              href={topic.cta.href}
              className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
            >
              {pickLocale(topic.cta.label, locale)}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        )}
      </section>

      {related.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-zinc-900">{labels.related}</h2>
          <ul className="divide-y divide-zinc-100">
            {related.map(({ topic: rt, category: rc }: { topic: HelpTopic; category: HelpCategory }) => (
              <li key={rt.slug}>
                <Link
                  href={`/dashboard/help/${rc.slug}/${rt.slug}`}
                  className="flex items-center justify-between gap-2 py-2 text-sm text-zinc-700 hover:text-purple-700"
                >
                  <span className="truncate">{pickLocale(rt.title, locale)}</span>
                  <ChevronRight className="h-3.5 w-3.5 flex-none text-zinc-300" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        href="/dashboard/help"
        className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden />
        {labels.back}
      </Link>
    </article>
  );
}
