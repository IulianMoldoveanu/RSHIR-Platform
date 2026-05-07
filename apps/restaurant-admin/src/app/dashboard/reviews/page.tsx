import { Star } from 'lucide-react';
import { EmptyState } from '@hir/ui';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';
import { ModerationRow } from './moderation-row';
import { HepySuggestions } from './hepy-suggestions';
import type { DraftSnapshot } from './hepy-actions';

export const dynamic = 'force-dynamic';

function Stars({ value }: { value: number }) {
  const v = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${v} din 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${n <= v ? 'fill-amber-400 text-amber-400' : 'text-zinc-300'}`}
          aria-hidden
        />
      ))}
    </span>
  );
}

export default async function ReviewsModerationPage() {
  const { tenant } = await getActiveTenant();
  const admin = createAdminClient();

  const { data: rowsRaw } = await admin
    .from('restaurant_reviews')
    .select('id, rating, comment, created_at, hidden_at, order_id')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .limit(200);
  const rows = rowsRaw ?? [];

  const visible = rows.filter((r) => r.hidden_at === null);
  const hidden = rows.filter((r) => r.hidden_at !== null);

  // Pre-load any in-flight CS Agent drafts for the visible reviews so the
  // "Sugestii Hepy" panel renders open with state instead of an empty
  // button. One query for all visible reviews keeps it O(1) requests.
  const visibleIds = visible.map((r) => r.id);
  const draftsByReviewId = new Map<string, DraftSnapshot>();
  if (visibleIds.length > 0) {
    // cs_agent_responses not yet in generated supabase types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminAny = admin as unknown as any;
    const { data: drafts } = await adminAny
      .from('cs_agent_responses')
      .select('id, tenant_id, intent, status, source_id, response_options, selected_option, posted_at, created_at')
      .eq('tenant_id', tenant.id)
      .eq('intent', 'review_reply')
      .in('source_id', visibleIds)
      .in('status', ['DRAFT', 'SELECTED', 'POSTED'])
      .order('created_at', { ascending: false });
    for (const d of drafts ?? []) {
      // Only keep the latest draft per review (`order desc` puts it first).
      if (d.source_id && !draftsByReviewId.has(d.source_id)) {
        draftsByReviewId.set(d.source_id, d as DraftSnapshot);
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Recenzii clienți</h1>
        <p className="text-sm text-zinc-600">
          Recenziile vizibile apar pe pagina restaurantului ca rating mediu
          (★ avg și AggregateRating SEO). Cele ascunse rămân aici pentru
          context dar sunt scoase din public.
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-800">
          Vizibile ({visible.length})
        </h2>
        {visible.length === 0 ? (
          <EmptyState
            icon={<Star className="h-10 w-10" />}
            title="Nicio recenzie publicată încă."
            description="Recenziile primite de la clienți după livrare vor apărea aici."
          />
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
            {visible.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 px-4 py-3 text-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1">
                    <div className="flex items-baseline gap-3">
                      <Stars value={r.rating} />
                      <span className="text-xs text-zinc-500">
                        {new Date(r.created_at).toLocaleString('ro-RO')}
                      </span>
                      <span className="font-mono text-[11px] text-zinc-400">
                        #{r.order_id.slice(0, 8)}
                      </span>
                    </div>
                    {r.comment ? (
                      <p className="mt-1 whitespace-pre-wrap text-zinc-700">{r.comment}</p>
                    ) : (
                      <p className="mt-1 italic text-zinc-400">(fără comentariu)</p>
                    )}
                  </div>
                  <ModerationRow reviewId={r.id} initialHidden={false} tenantId={tenant.id} />
                </div>
                <HepySuggestions
                  reviewId={r.id}
                  rating={r.rating}
                  comment={r.comment}
                  tenantId={tenant.id}
                  existingDraft={draftsByReviewId.get(r.id) ?? null}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {hidden.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-zinc-800">
            Ascunse ({hidden.length})
          </h2>
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-zinc-50">
            {hidden.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 px-4 py-3 text-sm opacity-70 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1">
                  <div className="flex items-baseline gap-3">
                    <Stars value={r.rating} />
                    <span className="text-xs text-zinc-500">
                      {new Date(r.created_at).toLocaleString('ro-RO')}
                    </span>
                    <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                      ASCUNSĂ
                    </span>
                  </div>
                  {r.comment ? (
                    <p className="mt-1 whitespace-pre-wrap text-zinc-700">{r.comment}</p>
                  ) : (
                    <p className="mt-1 italic text-zinc-400">(fără comentariu)</p>
                  )}
                </div>
                <ModerationRow reviewId={r.id} initialHidden={true} tenantId={tenant.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
