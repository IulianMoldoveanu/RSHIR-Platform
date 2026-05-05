// FM-invite accept page. Public-by-route (gated only by middleware auth
// redirect). Token is read from the URL, hashed, and matched against
// fm_invites.token_hash. Email match against the signed-in user is
// required — case-insensitive.
//
// The accept submit goes through a tiny inline server action so the page
// stays a server component.

import { redirect } from 'next/navigation';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { acceptFleetManagerInvite } from '@/app/dashboard/settings/team/fm-invite-actions';
import { TENANT_COOKIE } from '@/lib/tenant';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

type LookupRow = {
  id: string;
  tenant_id: string;
  email: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  // Supabase returns the joined relation as either a single object or
  // an array depending on FK cardinality detection — handle both.
  tenants: { name: string } | { name: string }[] | null;
};

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function tenantNameFrom(row: LookupRow): string {
  if (!row.tenants) return 'restaurantul invitat';
  if (Array.isArray(row.tenants)) return row.tenants[0]?.name ?? 'restaurantul invitat';
  return row.tenants.name ?? 'restaurantul invitat';
}

async function signOutAndStay(formData: FormData): Promise<void> {
  'use server';
  const token = String(formData.get('token') ?? '');
  const supabase = createServerClient();
  await supabase.auth.signOut();
  redirect(`/login?next=${encodeURIComponent(`/invite/fm/${token}`)}`);
}

async function acceptAndRedirect(formData: FormData): Promise<void> {
  'use server';
  const token = String(formData.get('token') ?? '');
  const result = await acceptFleetManagerInvite(token);
  if (!result.ok) {
    redirect(`/invite/fm/${encodeURIComponent(token)}?err=${result.error}`);
  }
  // Set the active tenant to the freshly-accepted one so /dashboard
  // lands in the right context immediately.
  cookies().set({
    name: TENANT_COOKIE,
    value: result.tenant_id,
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
  });
  redirect('/dashboard');
}

export default async function FmInviteAcceptPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { err?: string };
}) {
  const token = params.token;
  if (!token || token.length < 16) {
    return <ExpiredOrInvalid reason="invalid_token" />;
  }

  // Auth check: middleware should already have redirected, but if a
  // server component renders before that we double-check here.
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/invite/fm/${token}`)}`);
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const tokenHash = hashToken(token);
  const { data, error } = await sb
    .from('fm_invites')
    .select(
      'id, tenant_id, email, expires_at, accepted_at, revoked_at, tenants:tenants(name)',
    )
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) {
    console.error('[fm-invite/accept] lookup failed', error.message);
    return <ExpiredOrInvalid reason="db_error" />;
  }
  if (!data) return <ExpiredOrInvalid reason="invalid_token" />;

  const row = data as LookupRow;

  if (row.revoked_at) return <ExpiredOrInvalid reason="revoked" />;
  // Note: if accepted_at is set we still let the accept action run — it
  // is idempotent for the same user (returns ok) and rejects for any
  // other user. Surfacing a generic "invitation no longer available"
  // here would block the original FM from completing a re-acceptance
  // after a partial flow.
  const expiresAt = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return <ExpiredOrInvalid reason="expired" />;
  }

  const tenantName = tenantNameFrom(row);
  const inviteEmail = row.email.toLowerCase();
  const userEmail = (user.email ?? '').toLowerCase();

  if (inviteEmail !== userEmail) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-md rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <h1 className="mb-2 text-base font-semibold">Adresă de email diferită</h1>
          <p className="mb-3">
            Această invitație a fost emisă pentru <strong>{row.email}</strong>, dar
            sunteți autentificat ca <strong>{user.email}</strong>.
          </p>
          <p className="mb-3">
            Deconectați-vă și autentificați-vă din nou cu adresa corectă pentru a
            accepta invitația.
          </p>
          <form action={signOutAndStay}>
            <input type="hidden" name="token" value={token} />
            <button
              type="submit"
              className="inline-flex items-center rounded-md bg-amber-700 px-3 py-2 text-xs font-medium text-white hover:bg-amber-800"
            >
              Deconectare
            </button>
          </form>
        </div>
      </main>
    );
  }

  const errorBanner = renderErrorBanner(searchParams.err);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold tracking-tight text-zinc-900">
          Invitație manager flotă
        </h1>
        <p className="mb-4 text-sm text-zinc-600">
          Ați fost invitat să administrați flota pentru{' '}
          <strong className="text-zinc-900">{tenantName}</strong>.
        </p>

        {errorBanner}

        <form action={acceptAndRedirect} className="flex flex-col gap-3">
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
          >
            Acceptă invitația
          </button>
        </form>

        <p className="mt-4 text-xs text-zinc-500">
          Prin acceptare, contul dumneavoastră ({user.email}) va primi acces la{' '}
          {tenantName} cu rolul <strong>Manager flotă</strong>.
        </p>
      </div>
    </main>
  );
}

function renderErrorBanner(err: string | undefined) {
  if (!err) return null;
  const map: Record<string, string> = {
    invalid_token: 'Invitația nu mai este validă.',
    expired: 'Invitația a expirat.',
    email_mismatch: 'Adresa de email nu corespunde invitației.',
    unauthenticated: 'Sesiune expirată. Autentificați-vă și încercați din nou.',
    db_error: 'Eroare la salvare. Încercați din nou peste câteva momente.',
  };
  const message = map[err] ?? 'Nu am putut procesa invitația.';
  return (
    <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
      {message}
    </div>
  );
}

function ExpiredOrInvalid({ reason }: { reason: string }) {
  const text =
    reason === 'expired'
      ? 'Invitația a expirat.'
      : reason === 'revoked'
      ? 'Invitația a fost retrasă.'
      : reason === 'db_error'
      ? 'Nu am putut verifica invitația. Încercați din nou.'
      : 'Invitația nu mai este validă sau a fost folosită deja.';
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-base font-semibold text-zinc-900">
          Invitație indisponibilă
        </h1>
        <p className="mb-4 text-sm text-zinc-600">{text}</p>
        <a
          href="/login"
          className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Mergi la autentificare
        </a>
      </div>
    </main>
  );
}
