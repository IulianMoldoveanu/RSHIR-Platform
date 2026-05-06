import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';
import { getLatestSuggestions, getAutoExecutedActions } from '@/lib/ai-ceo/queries';
import { getAiAvailability } from '@/lib/ai-availability';
import { AiUnavailableNotice } from '@/components/ai/ai-unavailable-notice';

// Drives engagement on HIR's strategic differentiator. Suggestions and
// auto-actions live on /dashboard/ai-ceo but operators rarely visit that
// page — surfacing pending counts on the home screen pulls them in.
// Hidden when there's nothing to show AND the AI provider is healthy, so
// the dashboard stays clean for new tenants who haven't connected the bot
// yet. When AI is degraded but no historical data exists, we surface a
// friendly notice so the operator understands the silence is intentional.
export async function AiCeoWidget({ tenantId }: { tenantId: string }) {
  const [suggestions, autoActions, aiAvail] = await Promise.all([
    getLatestSuggestions(tenantId),
    getAutoExecutedActions(tenantId, 7),
    getAiAvailability(),
  ]);

  const pending = suggestions.filter((s) => s.status === 'pending');
  const totalSuggestions = suggestions.length;
  const totalAuto = autoActions.length;
  const briefStatus = aiAvail.byFunction['copilot-daily-brief'];
  const briefDegraded = briefStatus?.degraded === true;

  // No history + AI degraded: render the friendly notice so the dashboard
  // doesn't silently swallow the AI surface.
  if (totalSuggestions === 0 && totalAuto === 0) {
    if (briefDegraded) {
      return (
        <AiUnavailableNotice
          body="Asistentul AI este în mentenanță. Brief-ul zilnic și sugestiile vor fi reactivate în scurt timp."
        />
      );
    }
    return null;
  }

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
              {briefDegraded
                ? 'Asistentul AI este în mentenanță — afișăm istoricul recent.'
                : pending.length > 0
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
