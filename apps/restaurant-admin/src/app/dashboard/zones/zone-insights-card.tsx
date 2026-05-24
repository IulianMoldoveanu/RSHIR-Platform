import Link from 'next/link';
import { Lightbulb, ArrowRight, CheckCircle2 } from 'lucide-react';
import type { ZoneInsight } from './insights';

// Renders a compact, scannable list of zone insights at the top of the
// zones page. Each item gets a colour-coded dot (info / warn) and an
// optional CTA. Empty list = render nothing (keeps the page clean for
// brand-new tenants who don't have a week of history yet).

export function ZoneInsightsCard({ insights }: { insights: ZoneInsight[] }) {
  if (insights.length === 0) return null;
  return (
    <section className="rounded-xl border border-zinc-200 bg-gradient-to-br from-amber-50/40 via-white to-white p-4">
      <header className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100">
          <Lightbulb className="h-4 w-4 text-amber-700" aria-hidden />
        </span>
        <h2 className="text-sm font-semibold text-zinc-900">Sugestii pe baza ultimei săptămâni</h2>
      </header>
      <ul className="mt-3 flex flex-col gap-2">
        {insights.map((i) => (
          <li
            key={i.id}
            className="flex items-start gap-3 rounded-md border border-zinc-100 bg-white p-3"
          >
            <span
              className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full ${
                i.severity === 'warn' ? 'bg-amber-100' : 'bg-emerald-100'
              }`}
              aria-hidden
            >
              {i.severity === 'warn' ? (
                <span className="h-2 w-2 rounded-full bg-amber-500" />
              ) : (
                <CheckCircle2 className="h-3 w-3 text-emerald-700" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-900">{i.title}</p>
              <p className="mt-0.5 text-xs text-zinc-600">{i.body}</p>
              {i.ctaHref && i.ctaLabel ? (
                <Link
                  href={i.ctaHref}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-900"
                >
                  {i.ctaLabel}
                  <ArrowRight className="h-3 w-3" aria-hidden />
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
