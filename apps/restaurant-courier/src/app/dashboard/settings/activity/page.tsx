import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Activity, ChevronLeft } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { labelForAction, formatRoRelative } from '@/lib/audit-labels';
import { GdprDataExportButton } from '@/components/gdpr-data-export-button';
import { EmptyState } from '@/components/empty-state';

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
        className="inline-flex min-h-[32px] items-center gap-1.5 self-start rounded-lg px-1 text-xs font-medium text-hir-muted-fg transition-colors hover:text-hir-fg focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        Setări
      </Link>

      <header className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-500/30">
          <Activity className="h-5 w-5 text-violet-300" aria-hidden />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-hir-fg">
            Istoricul activității mele
          </h1>
          <p className="mt-0.5 text-sm leading-relaxed text-hir-muted-fg">
            Ultimele 100 de acțiuni înregistrate de aplicație în contul tău.
            Conform GDPR Art. 15 (dreptul de acces la datele personale).
          </p>
        </div>
      </header>

      <section
        aria-label="Descarcă datele tale"
        className="flex flex-col gap-2 rounded-2xl border border-hir-border bg-hir-surface p-4"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
          Dreptul de portabilitate · GDPR Art. 20
        </p>
        <p className="text-xs leading-relaxed text-hir-muted-fg">
          Descarcă o copie a datelor tale (jurnal de activitate + preferințe
          stocate pe dispozitiv) într-un fișier JSON.
        </p>
        <GdprDataExportButton entries={rows} />
      </section>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Activity className="h-5 w-5" aria-hidden />}
          title="Nicio activitate înregistrată încă"
          hint="Pe măsură ce livrezi, evenimentele apar aici."
        />
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((row) => {
            const orderShort = shortOrderId(
              row.entity_type === 'courier_order' ? row.entity_id : null,
            );
            return (
              <li
                key={row.id}
                className="rounded-2xl border border-hir-border bg-hir-surface p-4 transition-colors hover:border-violet-500/30"
              >
                <details className="min-w-0 flex-1">
                  <summary className="-mx-1 -my-0.5 flex cursor-pointer list-none items-start gap-3 rounded-lg px-1 py-0.5 transition-colors hover:text-violet-200 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2">
                    <span
                      aria-hidden
                      className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(167,139,250,0.6)]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-hir-fg">
                        {labelForAction(row.action)}
                        {orderShort ? (
                          <span className="ml-2 rounded-md bg-violet-500/15 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-violet-200 ring-1 ring-inset ring-violet-500/30">
                            #{orderShort}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-[11px] tabular-nums text-hir-muted-fg">
                        {formatRoRelative(row.created_at)}
                      </p>
                    </div>
                  </summary>
                  <pre className="mt-3 overflow-x-auto rounded-lg border border-hir-border bg-hir-bg/60 p-3 font-mono text-[11px] leading-relaxed text-hir-muted-fg">
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

      <p className="mt-2 text-[11px] leading-relaxed text-hir-muted-fg">
        Datele afișate aici sunt stocate conform politicii de retenție HIR.
        Pentru cereri GDPR (rectificare, ștergere), contactează DPO la{' '}
        <a
          href="mailto:dpo@hirforyou.ro"
          className="font-medium text-violet-300 transition-colors hover:text-violet-200 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
        >
          dpo@hirforyou.ro
        </a>
        .
      </p>
    </div>
  );
}
