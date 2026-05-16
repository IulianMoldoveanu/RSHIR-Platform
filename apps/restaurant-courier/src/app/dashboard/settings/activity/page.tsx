import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Activity, ChevronLeft } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { labelForAction, formatRoRelative } from '@/lib/audit-labels';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Istoricul activității — HIR Curier',
};

type AuditRow = {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function shortOrderId(entityId: string | null): string | null {
  if (!entityId) return null;
  return entityId.slice(0, 8);
}

export default async function ActivityPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Defense-in-depth: even though audit_log RLS scopes by tenant + actor,
  // the explicit eq() on actor_user_id keeps this page strict-by-design and
  // prevents accidental cross-courier leaks when running under the admin
  // client (which is needed because audit_log is not exposed via the
  // user-scoped client).
  const admin = createAdminClient();
  const { data } = await admin
    .from('audit_log')
    .select('id, action, entity_type, entity_id, metadata, created_at')
    .eq('actor_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (data ?? []) as AuditRow[];

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <Link
        href="/dashboard/settings"
        className="flex min-h-[44px] items-center gap-1 self-start text-sm text-hir-muted-fg hover:text-hir-fg"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Setări
      </Link>

      <header>
        <h1 className="text-xl font-bold text-hir-fg">Istoricul activității mele</h1>
        <p className="mt-1 text-sm text-hir-muted-fg">
          Ultimele 100 de acțiuni înregistrate de aplicație în contul tău.
          Aceste informații sunt prelucrate conform GDPR Art. 15 (dreptul de
          acces la datele personale).
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-hir-border bg-hir-surface p-8 text-center">
          <Activity className="h-8 w-8 text-hir-muted-fg" aria-hidden />
          <p className="text-sm font-medium text-hir-fg">
            Nicio activitate înregistrată încă
          </p>
          <p className="text-xs text-hir-muted-fg">
            Pe măsură ce livrezi, evenimentele apar aici.
          </p>
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((row) => {
            const orderShort = shortOrderId(
              row.entity_type === 'courier_order' ? row.entity_id : null,
            );
            return (
              <li
                key={row.id}
                className="flex items-start gap-3 rounded-2xl border border-hir-border bg-hir-surface p-4"
              >
                <span
                  aria-hidden
                  className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-violet-500"
                />
                <details className="min-w-0 flex-1">
                  <summary className="cursor-pointer list-none">
                    <p className="text-sm font-medium text-hir-fg">
                      {labelForAction(row.action)}
                      {orderShort ? (
                        <span className="ml-2 rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-mono text-violet-300">
                          #{orderShort}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-[11px] text-hir-muted-fg">
                      {formatRoRelative(row.created_at)}
                    </p>
                  </summary>
                  <pre className="mt-3 overflow-x-auto rounded-lg border border-hir-border bg-hir-bg/60 p-3 text-[10px] leading-relaxed text-hir-muted-fg">
                    {JSON.stringify(
                      {
                        action: row.action,
                        entity_type: row.entity_type,
                        entity_id: row.entity_id,
                        created_at: row.created_at,
                        metadata: row.metadata,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </li>
            );
          })}
        </ol>
      )}

      <p className="mt-2 text-[11px] text-hir-muted-fg">
        Datele afișate aici sunt stocate conform politicii de retenție HIR.
        Pentru cereri GDPR (rectificare, ștergere), contactează DPO la
        dpo@hirforyou.ro.
      </p>
    </div>
  );
}
