import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Gift, Receipt } from 'lucide-react';
import { resolveTenantFromHost } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { readCustomerCookie } from '@/lib/customer-recognition';
import { formatRon } from '@/lib/format';
import { t, type Locale } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import { getLoyaltyBalance, getLoyaltyHistory, type LoyaltyLedgerEntry } from '@/lib/loyalty';
import { repeatOrder } from './actions';

export const dynamic = 'force-dynamic';

type OrderItem = {
  itemId: string;
  name: string;
  priceRon: number;
  quantity: number;
  lineTotalRon: number;
};

type OrderRow = {
  id: string;
  created_at: string;
  total_ron: number;
  items: OrderItem[];
  public_track_token: string;
  payment_method: 'CARD' | 'COD' | null;
  payment_status: string | null;
};

function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'ro-RO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function summarizeItems(items: OrderItem[]): { names: string; more: number } {
  const names = items.slice(0, 3).map((i) => `${i.quantity}× ${i.name}`).join(', ');
  const more = Math.max(0, items.length - 3);
  return { names, more };
}

async function loadRecentOrders(tenantId: string, customerId: string): Promise<OrderRow[]> {
  const admin = getSupabaseAdmin();
  // Defensive SELECT: try with payment_method (20260504_001 column); on
  // 'column does not exist' fall back to the legacy set so the page stays
  // alive when the migration lags the code deploy.
  const COLS_FULL = 'id, created_at, total_ron, items, public_track_token, payment_method, payment_status';
  const COLS_LEGACY = 'id, created_at, total_ron, items, public_track_token';

  async function loadWith(cols: string) {
    return admin
      .from('restaurant_orders')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select(cols as any)
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(10);
  }
  let { data, error } = await loadWith(COLS_FULL);
  if (error && /payment_method/i.test(error.message ?? '')) {
    ({ data, error } = await loadWith(COLS_LEGACY));
  }
  if (error || !data) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    total_ron: Number(r.total_ron),
    items: (r.items ?? []) as OrderItem[],
    public_track_token: r.public_track_token,
    payment_method: (r.payment_method as 'CARD' | 'COD' | null | undefined) ?? null,
    payment_status: (r.payment_status as string | null | undefined) ?? null,
  }));
}

function formatLedgerDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'ro-RO', {
    dateStyle: 'medium',
  }).format(new Date(iso));
}

function ledgerKindLabel(kind: LoyaltyLedgerEntry['kind'], locale: Locale): string {
  switch (kind) {
    case 'earned':
      return t(locale, 'account.loyalty_kind_earned');
    case 'redeemed':
      return t(locale, 'account.loyalty_kind_redeemed');
    case 'expired':
      return t(locale, 'account.loyalty_kind_expired');
    case 'adjusted':
      return t(locale, 'account.loyalty_kind_adjusted');
    case 'welcome_bonus':
      return t(locale, 'account.loyalty_kind_welcome_bonus');
  }
}

export default async function AccountPage() {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) notFound();
  const locale = getLocale();

  const customerId = readCustomerCookie(tenant.id);
  const [orders, loyalty, loyaltyHistory] = await Promise.all([
    customerId ? loadRecentOrders(tenant.id, customerId) : Promise.resolve([]),
    customerId ? getLoyaltyBalance(tenant.id, customerId) : Promise.resolve(null),
    customerId ? getLoyaltyHistory(tenant.id, customerId, 5) : Promise.resolve([]),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-6 pb-32">
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-zinc-700 shadow-sm hover:text-zinc-900"
          aria-label={t(locale, 'account.back_to_menu')}
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          {t(locale, 'account.title')}
        </h1>
      </div>

      {loyalty && (
        <section className="mb-4 rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-purple-900">
              <Gift className="h-4 w-4" aria-hidden />
              {t(locale, 'account.loyalty_card_title')}
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold tracking-tight text-purple-900">
                {t(locale, 'account.loyalty_balance_template', {
                  count: String(loyalty.points),
                })}
              </p>
              <p className="text-[11px] text-purple-700">
                {t(locale, 'account.loyalty_value_template', {
                  amount: formatRon(
                    Number((loyalty.points * loyalty.settings.ron_per_point).toFixed(2)),
                    locale,
                  ),
                })}
              </p>
            </div>
          </div>
          {loyaltyHistory.length > 0 && (
            <div className="mt-3 border-t border-purple-100 pt-3">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-purple-600">
                {t(locale, 'account.loyalty_history_title')}
              </p>
              <ul className="space-y-1.5">
                {loyaltyHistory.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-700">
                      {ledgerKindLabel(entry.kind, locale)}
                      <span className="ml-2 text-zinc-400">
                        {formatLedgerDate(entry.createdAt, locale)}
                      </span>
                    </span>
                    <span
                      className={
                        'tabular-nums font-medium ' +
                        (entry.points > 0 ? 'text-emerald-700' : 'text-rose-700')
                      }
                    >
                      {entry.points > 0 ? '+' : ''}
                      {entry.points}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {orders.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-purple-50">
            <Receipt className="h-7 w-7 text-purple-600" />
          </div>
          <p className="text-lg font-semibold text-zinc-900">
            {t(locale, 'account.empty_title')}
          </p>
          <p className="max-w-sm text-sm leading-relaxed text-zinc-600">
            {t(locale, 'account.empty_body')}
          </p>
          <Link
            href="/"
            className="mt-2 inline-flex h-11 items-center justify-center rounded-full bg-[var(--hir-brand)] px-6 text-sm font-semibold text-white shadow-sm transition-all hover:scale-[1.02] hover:opacity-95 active:scale-[0.98]"
          >
            {t(locale, 'account.empty_cta')}
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => {
            const { names, more } = summarizeItems(o.items);
            return (
              <li key={o.id} className="rounded-xl border border-zinc-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-xs text-zinc-500">
                    {t(locale, 'account.order_short_id', { id: shortId(o.id) })}
                  </p>
                  <p className="text-xs text-zinc-500">{formatDate(o.created_at, locale)}</p>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-sm font-semibold text-zinc-900">
                    {formatRon(o.total_ron, locale)}
                  </p>
                  {o.payment_method === 'COD' && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
                      {t(locale, 'account.payment_cash')}
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-zinc-700">
                  {names}
                  {more > 0 ? `, ${t(locale, 'account.order_items_more', { count: more })}` : ''}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/track/${o.public_track_token}`}
                    className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                  >
                    {t(locale, 'account.view_order')}
                  </Link>
                  <form action={repeatOrder.bind(null, o.id)}>
                    <button
                      type="submit"
                      className="inline-flex h-9 items-center justify-center rounded-full bg-[var(--hir-brand)] px-4 text-sm font-medium text-white hover:opacity-90"
                    >
                      {t(locale, 'account.reorder')}
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
