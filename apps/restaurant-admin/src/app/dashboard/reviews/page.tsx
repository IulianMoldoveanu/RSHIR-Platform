import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';
import { ModerationRow } from './moderation-row';

export const dynamic = 'force-dynamic';

function Stars({ value }: { value: number }) {
  const v = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="text-amber-500" aria-label={`${v} din 5`}>
      {'★'.repeat(v)}
      <span className="text-zinc-300">{'★'.repeat(5 - v)}</span>
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
          <p className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-500">
            Nicio recenzie publicată încă.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
            {visible.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-start sm:justify-between">
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
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-zinc-50">
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
