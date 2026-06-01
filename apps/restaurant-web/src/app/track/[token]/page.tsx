import type { Metadata } from 'next';
import { z } from 'zod';
import { notFound } from 'next/navigation';
import { TrackClient } from './TrackClient';
import { getLocale } from '@/lib/i18n/server';
import { CookieConsent } from '@/components/legal/cookie-consent';
import { resolveTenantFromHost, tenantBaseUrl } from '@/lib/tenant';
import { readCustomerCookie } from '@/lib/customer-recognition';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

// Minimal order summary needed for metadata — fetched via the same
// get_public_order RPC used by the track API route. Returns null when the
// token is not found or the RPC errors (metadata falls back to generic title).
async function fetchOrderSummary(
  token: string,
): Promise<{ shortId: string; status: string; tenantName: string } | null> {
  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin.rpc as any)('get_public_order', { p_token: token });
  if (error || !data) return null;
  const row = data as { id: string; status: string; tenant: { name: string } | null };
  const tenantName = row.tenant?.name ?? '';
  return { shortId: row.id.slice(0, 8), status: row.status, tenantName };
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'În așteptare',
  CONFIRMED: 'Confirmată',
  PREPARING: 'În pregătire',
  READY: 'Gata de livrare',
  IN_DELIVERY: 'În livrare',
  DELIVERED: 'Livrată',
  CANCELLED: 'Anulată',
};

export async function generateMetadata(
  props: { params: Promise<{ token: string }> },
): Promise<Metadata> {
  const params = await props.params;
  const parsed = z.string().uuid().safeParse(params.token);
  if (!parsed.success) return {};
  const summary = await fetchOrderSummary(parsed.data);
  if (!summary) return {};
  const statusLabel = STATUS_LABEL[summary.status] ?? summary.status;
  const title = `Comanda #${summary.shortId} — Status: ${statusLabel} — ${summary.tenantName}`;
  const url = `${tenantBaseUrl()}/track/${parsed.data}`;
  return {
    title,
    alternates: { canonical: url },
    openGraph: {
      title,
      url,
      siteName: summary.tenantName,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
    },
    robots: { index: false, follow: false },
  };
}

export default async function TrackPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const parsed = z.string().uuid().safeParse(params.token);
  if (!parsed.success) notFound();
  const locale = await getLocale();
  const { tenant } = await resolveTenantFromHost();
  const showAccountNudge = tenant ? readCustomerCookie(tenant.id) !== null : false;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <TrackClient token={parsed.data} locale={locale} showAccountNudge={showAccountNudge} />
      <CookieConsent locale={locale} />
    </main>
  );
}
