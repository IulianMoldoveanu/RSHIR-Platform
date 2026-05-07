// /dashboard/customer-insights — Hepy weekly summary of customer feedback.
// Sprint 14 / CS Agent.
//
// Server-renders the most recent stored digest (if any) for the active
// week, with a "Reîmprospătează" button that re-runs Hepy. Pure read for
// tenant members; writes go through the server action which re-verifies
// membership.

import { Sparkles, TrendingUp, TrendingDown, Minus, ListChecks, ThumbsUp, ThumbsDown } from 'lucide-react';
import { EmptyState } from '@hir/ui';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';
import { GenerateButton } from './generate-button';

export const dynamic = 'force-dynamic';

type DigestPayload = {
  top_praised?: string[];
  top_complaints?: string[];
  sentiment?: {
    trend?: 'improving' | 'stable' | 'declining' | 'unknown';
    score?: number;
  };
  action_items?: string[];
};

function isoWeekLabel(d: Date): string {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const weekNum = 1 + Math.round(
    ((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
  );
  return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function trendIcon(trend?: string) {
  if (trend === 'improving') return <TrendingUp className="h-4 w-4 text-emerald-600" aria-hidden />;
  if (trend === 'declining') return <TrendingDown className="h-4 w-4 text-rose-600" aria-hidden />;
  return <Minus className="h-4 w-4 text-zinc-400" aria-hidden />;
}

function trendLabel(trend?: string): string {
  switch (trend) {
    case 'improving':
      return 'În creștere';
    case 'declining':
      return 'În scădere';
    case 'stable':
      return 'Stabil';
    default:
      return 'Date insuficiente';
  }
}

export default async function CustomerInsightsPage() {
  const { tenant } = await getActiveTenant();
  const admin = createAdminClient();
  // cs_agent_responses not yet in generated supabase types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as unknown as any;
  const week = isoWeekLabel(new Date());

  const { data: digest } = await adminAny
    .from('cs_agent_responses')
    .select('id, source_id, response_options, created_at')
    .eq('tenant_id', tenant.id)
    .eq('intent', 'feedback_digest')
    .eq('source_id', week)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Counts from the actual underlying data — what Hepy would summarise if
  // we ran the digest right now. Used for the "based on N reviews" line
  // and the empty-state CTA.
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [reviewsCountResp, chatCountResp] = await Promise.all([
    admin
      .from('restaurant_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .is('hidden_at', null)
      .gte('created_at', since),
    adminAny
      .from('support_messages')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .gte('created_at', since),
  ]);
  const reviewCount = reviewsCountResp.count ?? 0;
  const chatCount = chatCountResp.count ?? 0;

  const payload = (digest?.response_options as DigestPayload | undefined) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-600" aria-hidden />
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Insights clienți
          </h1>
        </div>
        <p className="mt-1 text-sm text-zinc-600">
          Sumar săptămânal generat de Hepy din recenzii și mesajele de
          suport. Săptămâna curentă: <span className="font-medium">{week}</span>.
        </p>
      </header>

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-zinc-700">
            Bază de date: <span className="font-medium">{reviewCount}</span> recenzii ·{' '}
            <span className="font-medium">{chatCount}</span> mesaje suport
          </span>
          <span className="ml-auto">
            <GenerateButton tenantId={tenant.id} hasDigest={Boolean(digest)} />
          </span>
        </div>
      </div>

      {!payload ? (
        <EmptyState
          icon={<Sparkles className="h-10 w-10" />}
          title="Niciun sumar generat încă pentru săptămâna aceasta."
          description={
            reviewCount + chatCount > 0
              ? 'Apăsați butonul de mai sus pentru ca Hepy să analizeze feedback-ul săptămânii.'
              : 'Săptămâna aceasta nu există recenzii sau mesaje noi. Reveniți după ce primiți feedback de la clienți.'
          }
        />
      ) : (
        <>
          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
              {trendIcon(payload.sentiment?.trend)} Tendință generală: {trendLabel(payload.sentiment?.trend)}
              {typeof payload.sentiment?.score === 'number' ? (
                <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700">
                  scor {payload.sentiment.score.toFixed(2)}
                </span>
              ) : null}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              icon={<ThumbsUp className="h-4 w-4 text-emerald-600" />}
              title="Top apreciate"
              empty="Nicio temă pozitivă recurentă identificată."
              items={payload.top_praised ?? []}
            />
            <Panel
              icon={<ThumbsDown className="h-4 w-4 text-rose-600" />}
              title="Top reclamații"
              empty="Nicio plângere recurentă — felicitări!"
              items={payload.top_complaints ?? []}
            />
          </div>

          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-800">
              <ListChecks className="h-4 w-4 text-purple-600" />
              Acțiuni recomandate
            </h2>
            {(payload.action_items ?? []).length === 0 ? (
              <p className="text-sm italic text-zinc-500">
                Hepy nu a sugerat acțiuni săptămâna aceasta.
              </p>
            ) : (
              <ol className="ml-5 list-decimal space-y-1.5 text-sm text-zinc-700">
                {payload.action_items!.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ol>
            )}
          </section>

          {digest?.created_at ? (
            <p className="text-xs text-zinc-500">
              Generat la {new Date(digest.created_at).toLocaleString('ro-RO')}.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function Panel({
  icon,
  title,
  empty,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  empty: string;
  items: string[];
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-800">
        {icon}
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="text-sm italic text-zinc-500">{empty}</p>
      ) : (
        <ul className="space-y-1.5 text-sm text-zinc-700">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-zinc-400" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
