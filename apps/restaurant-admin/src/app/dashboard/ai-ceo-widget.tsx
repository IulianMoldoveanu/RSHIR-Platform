import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';
import { getLatestSuggestions, getAutoExecutedActions } from '@/lib/ai-ceo/queries';

// Drives engagement on HIR's strategic differentiator. Suggestions and
// auto-actions live on /dashboard/ai-ceo but operators rarely visit that
// page — surfacing pending counts on the home screen pulls them in.
// Hidden when there's nothing to show, so the dashboard stays clean for
// new tenants who haven't connected the bot yet.
export async function AiCeoWidget({ tenantId }: { tenantId: string }) {
  const [suggestions, autoActions] = await Promise.all([
    getLatestSuggestions(tenantId),
    getAutoExecutedActions(tenantId, 7),
  ]);

  const pending = suggestions.filter((s) => s.status === 'pending');
  const totalSuggestions = suggestions.length;
  const totalAuto = autoActions.length;

  // Hide the entire widget when the bot hasn't done anything for this tenant
  // yet. The empty state already lives on /dashboard/ai-ceo for operators
  // who navigate there directly.
  if (totalSuggestions === 0 && totalAuto === 0) return null;

  return (
    <Link
      href="/dashboard/ai-ceo"
      className="group block overflow-hidden rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 via-white to-purple-50/30 p-4 transition-shadow hover:shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-full bg-purple-100">
            <Sparkles className="h-4.5 w-4.5 text-purple-700" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-purple-700">
              AI CEO
            </p>
            <p className="mt-0.5 text-sm font-semibold text-zinc-900">
              {pending.length > 0 ? (
                <>
                  Ai{' '}
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-bold text-amber-900">
                    {pending.length}
                  </span>{' '}
                  {pending.length === 1 ? 'sugestie' : 'sugestii'} de aprobat
                </>
              ) : totalAuto > 0 ? (
                <>
                  Botul a executat{' '}
                  <span className="font-bold text-emerald-700">{totalAuto}</span>{' '}
                  {totalAuto === 1 ? 'acțiune' : 'acțiuni'} în 7 zile
                </>
              ) : (
                <>Vezi propunerile asistentului</>
              )}
            </p>
            <p className="mt-0.5 truncate text-xs text-zinc-600">
              {pending.length > 0
                ? 'Aprobă sau respinge ce a propus botul azi.'
                : 'Activitate recentă a copilotului tău digital.'}
            </p>
          </div>
        </div>
        <span className="inline-flex flex-none items-center gap-1 text-xs font-medium text-purple-700 group-hover:text-purple-900">
          Deschide
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
