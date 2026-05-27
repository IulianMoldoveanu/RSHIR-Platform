// Lane HIRforYOU-MARKETPLACE (2026-05-28) — /cont marketplace customer
// account page.
//
// Cross-tenant unified order history for marketplace customers. Reads from
// `marketplace_customers` (auth-scoped by auth.uid()) and joins
// `restaurant_orders` where order_source='marketplace'. The order detail
// link still points at the existing per-order tracking page on the tenant
// host — we don't re-host tracking on hirforyou.ro to avoid duplicating
// the realtime infrastructure (followup: cross-host iframe / proxy).
//
// MVP: read-only history + sign-out. Sign-in is delegated to the existing
// Supabase auth UI (magic link). Address book + favorites are followups.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogIn, Receipt, Star } from 'lucide-react';
import {
  MarketingHeader,
  MarketingFooter,
} from '@/components/marketing/marketing-shell';
import { getSupabase } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getLocale } from '@/lib/i18n/server';
import { formatRon } from '@/lib/format';
import { tenantCanonicalUrl } from '@/lib/seo-marketing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MarketplaceOrderRow = {
  id: string;
  created_at: string;
  total_ron: number;
  status: string;
  public_track_token: string | null;
  tenant: {
    id: string;
    slug: string;
    name: string;
    custom_domain: string | null;
    city_slug: string | null;
  } | null;
};

export default async function MarketplaceAccountPage() {
  const currentLocale = getLocale();
  const supabase = getSupabase();
  const { data: userResp } = await supabase.auth.getUser();

  if (!userResp?.user) {
    return <SignInView locale={currentLocale} />;
  }

  const user = userResp.user;
  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = admin;

  // Resolve the marketplace_customer row for this auth user. If missing,
  // create one on-the-fly so first-time logins from a magic link have a
  // home immediately. We pull email/phone from the auth.users record so
  // we don't lose contact info if the user signs in before placing an
  // order.
  let { data: customer } = await sb
    .from('marketplace_customers')
    .select('id, full_name, preferred_city')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!customer) {
    const { data: inserted } = await sb
      .from('marketplace_customers')
      .insert({
        auth_user_id: user.id,
        email: user.email ?? null,
        phone: user.phone ?? null,
      })
      .select('id, full_name, preferred_city')
      .single();
    customer = inserted ?? null;
  }
  if (!customer) {
    // Truly cannot resolve a marketplace customer — fall back to sign-in.
    return <SignInView locale={currentLocale} />;
  }

  const { data: ordersRaw } = await sb
    .from('restaurant_orders')
    .select(
      `
        id, created_at, total_ron, status, public_track_token,
        tenant:tenants ( id, slug, name, custom_domain, city_id, cities ( slug ) )
      `,
    )
    .eq('marketplace_customer_id', customer.id)
    .eq('order_source', 'marketplace')
    .order('created_at', { ascending: false })
    .limit(50);

  const orders: MarketplaceOrderRow[] = ((ordersRaw ?? []) as unknown as Array<{
    id: string;
    created_at: string;
    total_ron: number;
    status: string;
    public_track_token: string | null;
    tenant:
      | {
          id: string;
          slug: string;
          name: string;
          custom_domain: string | null;
          cities: { slug: string | null } | null;
        }
      | null;
  }>).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    total_ron: row.total_ron,
    status: row.status,
    public_track_token: row.public_track_token,
    tenant: row.tenant
      ? {
          id: row.tenant.id,
          slug: row.tenant.slug,
          name: row.tenant.name,
          custom_domain: row.tenant.custom_domain,
          city_slug: row.tenant.cities?.slug ?? null,
        }
      : null,
  }));

  return (
    <main
      id="main-content"
      className="min-h-screen bg-[#FAFAFA] text-[#0F172A]"
      style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
    >
      <MarketingHeader currentLocale={currentLocale} />

      <section className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 md:py-16">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Contul meu</h1>
          <p className="mt-3 text-sm text-[#475569]">
            Conectat ca <span className="font-medium text-[#0F172A]">{user.email ?? user.phone}</span>
          </p>
          <form action="/api/cont/sign-out" method="post" className="mt-4">
            <button
              type="submit"
              className="text-sm font-medium text-[#4F46E5] hover:underline"
            >
              Deconectează-te
            </button>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 md:py-14">
        <h2 className="text-2xl font-semibold tracking-tight">Comenzile mele</h2>
        {orders.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-8 text-center">
            <Receipt className="mx-auto h-8 w-8 text-[#94A3B8]" />
            <p className="mt-3 text-sm font-medium text-[#0F172A]">Nicio comandă încă</p>
            <p className="mt-1 text-sm text-[#475569]">
              Comenzile plasate prin HIR Marketplace vor apărea aici.
            </p>
            <Link
              href="/restaurante"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338CA]"
            >
              Caută restaurante
            </Link>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {orders.map((order) => (
              <OrderRowView key={order.id} order={order} />
            ))}
          </ul>
        )}
      </section>

      <MarketingFooter currentLocale={currentLocale} />
    </main>
  );
}

function OrderRowView({ order }: { order: MarketplaceOrderRow }) {
  const tenant = order.tenant;
  const detailHref =
    tenant && tenant.city_slug
      ? `/restaurante/${tenant.city_slug}/${tenant.slug}`
      : tenant
        ? `/restaurante/_/${tenant.slug}`
        : '/restaurante';

  const trackHref =
    tenant && order.public_track_token
      ? `${tenantCanonicalUrl({ slug: tenant.slug, custom_domain: tenant.custom_domain })}/track/${order.public_track_token}`
      : null;

  return (
    <li className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={detailHref} className="font-medium text-[#0F172A] hover:underline">
            {tenant?.name ?? 'Restaurant'}
          </Link>
          <p className="mt-1 text-xs text-[#64748B]">
            {new Date(order.created_at).toLocaleString('ro-RO', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-[#0F172A]">
            {formatRon(order.total_ron, 'ro')}
          </p>
          <p className="mt-1 text-xs uppercase tracking-wide text-[#64748B]">{order.status}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
        {trackHref ? (
          <a href={trackHref} className="font-medium text-[#4F46E5] hover:underline">
            Vezi tracking
          </a>
        ) : null}
        {order.status === 'DELIVERED' && tenant ? (
          <Link
            href={`/cont/recenzie/${order.id}`}
            className="inline-flex items-center gap-1 font-medium text-[#4F46E5] hover:underline"
          >
            <Star className="h-3.5 w-3.5" />
            Lasă o recenzie
          </Link>
        ) : null}
      </div>
    </li>
  );
}

function SignInView({ locale }: { locale: 'ro' | 'en' }) {
  return (
    <main
      id="main-content"
      className="min-h-screen bg-[#FAFAFA] text-[#0F172A]"
      style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}
    >
      <MarketingHeader currentLocale={locale} />
      <section className="mx-auto max-w-md px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-8 text-center">
          <LogIn className="mx-auto h-8 w-8 text-[#4F46E5]" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Conectează-te</h1>
          <p className="mt-2 text-sm text-[#475569]">
            Vezi istoricul comenzilor tale și lasă recenzii pentru restaurantele HIR. Îți trimitem un
            link magic pe email — fără parolă.
          </p>
          <form action="/api/cont/sign-in" method="post" className="mt-6 space-y-3 text-left">
            <label htmlFor="email" className="block text-sm font-medium text-[#0F172A]">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#4F46E5] focus:outline-none focus:ring-2 focus:ring-[#C7D2FE]"
              placeholder="email@exemplu.ro"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-[#4F46E5] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#4338CA]"
            >
              Trimite link de conectare
            </button>
          </form>
        </div>
      </section>
      <MarketingFooter currentLocale={locale} />
    </main>
  );
}
