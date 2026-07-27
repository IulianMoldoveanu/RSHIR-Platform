import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { MailX } from 'lucide-react';
import { resolveTenantFromHost } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { redeemMagicLink } from '@/lib/account/magic-link';
import { customerCookieName, CUSTOMER_COOKIE_MAX_AGE_SECONDS } from '@/lib/customer-recognition';
import { getConsent } from '@/lib/consent.server';
import { t, type TKey } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

// GET-only redeem page — a magic-link click is a plain browser navigation,
// not a fetch() call, so this has to be a page (not an API route the client
// JS calls). Sets the recognition cookie server-side then redirects to
// /account on success; renders an inline error on failure instead of
// bouncing through a query-param (keeps the raw token out of any client-
// visible redirect chain / analytics).
export default async function RedeemMagicLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { tenant } = await resolveTenantFromHost();
  const { token } = await searchParams;

  if (!tenant || !token) {
    return <RedeemError localeKey="account.redeem_invalid" />;
  }

  const admin = getSupabaseAdmin();
  const result = await redeemMagicLink(admin, { tenantId: tenant.id, rawToken: token });

  if (!result.ok) {
    const localeKey =
      result.reason === 'expired' ? 'account.redeem_expired' : 'account.redeem_invalid';
    return <RedeemError localeKey={localeKey} />;
  }

  const consent = getConsent();
  if (!(consent && consent.analytics === false)) {
    const jar = await cookies();
    jar.set({
      name: customerCookieName(tenant.id),
      value: result.customerId,
      maxAge: CUSTOMER_COOKIE_MAX_AGE_SECONDS,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      httpOnly: true,
    });
  }

  redirect('/account');
}

async function RedeemError({ localeKey }: { localeKey: TKey }) {
  const locale = await getLocale();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-10 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-50">
        <MailX className="h-7 w-7 text-rose-500" aria-hidden />
      </div>
      <p className="mb-6 text-sm text-zinc-600">{t(locale, localeKey)}</p>
      <Link
        href="/account"
        className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--hir-brand,#7c3aed)] px-6 text-sm font-semibold text-white shadow-sm"
      >
        {t(locale, 'account.redeem_retry_cta')}
      </Link>
    </main>
  );
}
