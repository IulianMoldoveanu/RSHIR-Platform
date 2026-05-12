// Platform-admin-only: Feedback report detail.
// Shows screenshot inline (signed URL, 24h), console excerpt, metadata, and a
// "mark resolved" button.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { markResolvedAction } from './actions';

export const dynamic = 'force-dynamic';

const SCREENSHOT_TTL_SEC = 24 * 60 * 60;

const CATEGORY_LABEL: Record<string, string> = {
  BUG: 'Eroare',
  UX_FRICTION: 'Sugestie UX',
  FEATURE_REQUEST: 'Cerere',
  QUESTION: 'Întrebare',
};

const STATUS_LABEL: Record<string, string> = {
  NEW: 'Nou',
  TRIAGED: 'Triat',
  FIX_ATTEMPTED: 'Fix încercat',
  FIX_PROPOSED: 'PR propus',
  FIX_AUTO_MERGED: 'Auto-merged',
  HUMAN_FIX_NEEDED: 'Necesită fix manual',
  RESOLVED: 'Rezolvat',
  DUPLICATE: 'Duplicat',
  REJECTED: 'Respins',
};

export default async function FeedbackDetailPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login');

  if (!isPlatformAdminEmail(user.email)) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Acces interzis: această pagină este rezervată administratorilor HIR.
      </div>
    );
  }

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        ID invalid.
      </div>
    );
  }

  // Cast: feedback_reports not yet in generated types (see partners/page.tsx).
  const admin = createAdminClient();
  const adminTyped = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const { data, error } = await adminTyped
    .from('feedback_reports')
    .select(
      'id, tenant_id, reporter_user_id, category, severity, status, ' +
        'description, url, user_agent, console_log_excerpt, screenshot_path, ' +
        'created_at, resolved_at, tenants:tenant_id ( slug, name )',
    )
    .eq('id', params.id)
    .maybeSingle();

  if (error) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Eroare la încărcare: {error.message}
      </div>
    );
  }
  if (!data) {
    return <div className="text-sm text-zinc-600">Nu am găsit raportul.</div>;
  }

  const r = data as unknown as {
    id: string;
    tenant_id: string | null;
    reporter_user_id: string | null;
    category: string;
    severity: string | null;
    status: string;
    description: string;
    url: string | null;
    user_agent: string | null;
    console_log_excerpt: string | null;
    screenshot_path: string | null;
    created_at: string;
    resolved_at: string | null;
    tenants: { slug: string | null; name: string | null } | null;
  };

  let screenshotUrl: string | null = null;
  if (r.screenshot_path) {
    const { data: signed } = await admin.storage
      .from('tenant-feedback-screenshots')
      .createSignedUrl(r.screenshot_path, SCREENSHOT_TTL_SEC);
    screenshotUrl = signed?.signedUrl ?? null;
  }

  const isResolved = r.status === 'RESOLVED';

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/dashboard/feedback"
        className="inline-flex w-fit items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Înapoi
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
            {CATEGORY_LABEL[r.category] ?? r.category}
          </span>
          <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
            {STATUS_LABEL[r.status] ?? r.status}
          </span>
          {r.severity && (
            <span className="rounded-md bg-rose-100 px-2 py-1 text-xs font-medium text-rose-800">
              {r.severity}
            </span>
          )}
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          {r.tenants?.name ?? r.tenants?.slug ?? '(no tenant)'} —{' '}
          <span className="font-mono text-sm text-zinc-500">#{r.id.slice(0, 8)}</span>
        </h1>
        <p className="text-xs text-zinc-500">
          Trimis {new Date(r.created_at).toLocaleString('ro-RO')}
          {r.resolved_at
            ? ` · rezolvat ${new Date(r.resolved_at).toLocaleString('ro-RO')}`
            : ''}
        </p>
      </header>

      <section className="rounded-md border border-zinc-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">Descriere</h2>
        <p className="whitespace-pre-wrap text-sm text-zinc-700">{r.description}</p>
      </section>

      {screenshotUrl && (
        <section className="rounded-md border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-zinc-900">Captură ecran</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={screenshotUrl}
            alt="Captură ecran"
            className="max-h-[600px] w-full rounded-md border border-zinc-200 object-contain"
          />
          <p className="mt-2 text-xs text-zinc-500">
            <a href={screenshotUrl} target="_blank" rel="noopener noreferrer" className="underline">
              Deschide la mărime completă
            </a>{' '}
            (link valabil 24h)
          </p>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-zinc-900">URL</h2>
          <p className="break-all text-sm text-zinc-700">{r.url ?? '—'}</p>
        </div>
        <div className="rounded-md border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-zinc-900">User agent</h2>
          <p className="break-all text-xs text-zinc-700">{r.user_agent ?? '—'}</p>
        </div>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">
          Console (sanitizat)
        </h2>
        {r.console_log_excerpt ? (
          <pre className="max-h-96 overflow-auto rounded-md bg-zinc-50 p-3 text-xs text-zinc-700">
            {r.console_log_excerpt}
          </pre>
        ) : (
          <p className="text-sm text-zinc-500">Niciun log.</p>
        )}
      </section>

      {!isResolved && (
        <form action={markResolvedAction}>
          <input type="hidden" name="id" value={r.id} />
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Marchez ca rezolvat
          </button>
        </form>
      )}
    </div>
  );
}
