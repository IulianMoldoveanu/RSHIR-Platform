// /dashboard/customers/reactivation — Lost customer reactivation list.
// Server component: reads v_lost_customers for the active tenant.

import { UserX } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';
import { renderTemplate } from '@/lib/reactivation-templates';
import { ContactButtons } from './_components/contact-buttons';

export const dynamic = 'force-dynamic';

type LostCustomer = {
  tenant_id: string;
  customer_phone: string;
  customer_first_name: string | null;
  last_order_at: string;
  last_order_total_cents: number | null;
  order_count: number;
  top_item_name: string | null;
};

const FILTER_OPTIONS = [
  { label: '30+ zile', days: 30 },
  { label: '60+ zile', days: 60 },
  { label: '90+ zile', days: 90 },
  { label: '180 zile', days: 180 },
] as const;

function maskPhone(phone: string): string {
  // Keep country code + first 3 + last 2 digits visible, mask middle
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.length < 7) return phone;
  return digits.slice(0, 4) + '****' + digits.slice(-2);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ro-RO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

export default async function ReactivationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const filterDays = Number(params.days ?? 30);
  const validDays = FILTER_OPTIONS.map((f) => f.days).includes(filterDays as never)
    ? filterDays
    : 30;

  const { tenant } = await getActiveTenant();
  const admin = createAdminClient();

  // v_lost_customers is not in generated types — use any cast
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as unknown as any;

  const cutoff = new Date(Date.now() - validDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await adminAny
    .from('v_lost_customers')
    .select('*')
    .eq('tenant_id', tenant.id)
    .lte('last_order_at', cutoff)
    .order('last_order_at', { ascending: false })
    .limit(50);

  const customers: LostCustomer[] = error ? [] : (rows ?? []);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="flex items-center gap-2">
          <UserX className="h-5 w-5 text-rose-500" aria-hidden />
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Clienți pierduți (30+ zile)
          </h1>
        </div>
        <p className="mt-1 text-sm text-zinc-600">
          Clienți cu minim 2 comenzi care nu au comandat în ultimele {validDays} de zile. Trimite-le
          un mesaj personalizat cu un singur click.
        </p>
      </header>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrează după inactivitate">
        {FILTER_OPTIONS.map((opt) => (
          <a
            key={opt.days}
            href={`/dashboard/customers/reactivation?days=${opt.days}`}
            aria-current={validDays === opt.days ? 'page' : undefined}
            className={
              validDays === opt.days
                ? 'rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white'
                : 'rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50'
            }
          >
            {opt.label}
          </a>
        ))}
        <span className="ml-auto text-xs text-zinc-500">
          {customers.length} client{customers.length !== 1 ? 'i' : ''} găsit{customers.length !== 1 ? 'i' : ''}
        </span>
      </div>

      {customers.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center">
          <UserX className="mx-auto mb-3 h-10 w-10 text-zinc-300" aria-hidden />
          <p className="text-sm font-medium text-zinc-900">
            Niciun client pierdut — clienții tăi sunt activi!
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Toți clienții cu 2+ comenzi au comandat în ultimele {validDays} de zile.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-zinc-200 bg-white md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-medium text-zinc-500">
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Ultima comandă</th>
                  <th className="px-4 py-3">Valoare</th>
                  <th className="px-4 py-3">Comenzi</th>
                  <th className="px-4 py-3">Top produs</th>
                  <th className="px-4 py-3">Acțiuni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {customers.map((c) => {
                  const name = c.customer_first_name ?? 'Client';
                  const topItem = c.top_item_name ?? 'comanda ta preferată';
                  const message = renderTemplate({
                    phone: c.customer_phone,
                    name,
                    topItem,
                    slug: tenant.slug,
                  });
                  return (
                    <tr key={c.customer_phone} className="hover:bg-zinc-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-900">{name}</div>
                        <div className="text-xs text-zinc-500">{maskPhone(c.customer_phone)}</div>
                      </td>
                      <td className="px-4 py-3 text-zinc-700">
                        <div>{formatDate(c.last_order_at)}</div>
                        <div className="text-xs text-zinc-400">
                          acum {daysSince(c.last_order_at)} zile
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-700">
                        {c.last_order_total_cents != null
                          ? `${(c.last_order_total_cents / 100).toFixed(2)} RON`
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                          {c.order_count}
                        </span>
                      </td>
                      <td className="max-w-[160px] truncate px-4 py-3 text-zinc-700">
                        {topItem}
                      </td>
                      <td className="px-4 py-3">
                        <ContactButtons
                          tenantId={tenant.id}
                          customerPhone={c.customer_phone}
                          message={message}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <ul className="flex flex-col gap-3 md:hidden" aria-label="Clienți pierduți">
            {customers.map((c) => {
              const name = c.customer_first_name ?? 'Client';
              const topItem = c.top_item_name ?? 'comanda ta preferată';
              const message = renderTemplate({
                phone: c.customer_phone,
                name,
                topItem,
                slug: tenant.slug,
              });
              return (
                <li
                  key={c.customer_phone}
                  className="rounded-xl border border-zinc-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-zinc-900">{name}</div>
                      <div className="text-xs text-zinc-500">{maskPhone(c.customer_phone)}</div>
                    </div>
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                      {daysSince(c.last_order_at)}z inactiv
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
                    <span>
                      Ultima comandă: <strong>{formatDate(c.last_order_at)}</strong>
                    </span>
                    <span>
                      Valoare:{' '}
                      <strong>
                        {c.last_order_total_cents != null
                          ? `${(c.last_order_total_cents / 100).toFixed(2)} RON`
                          : '—'}
                      </strong>
                    </span>
                    <span>
                      Comenzi totale: <strong>{c.order_count}</strong>
                    </span>
                    {c.top_item_name ? (
                      <span>
                        Top produs: <strong>{c.top_item_name}</strong>
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3">
                    <ContactButtons
                      tenantId={tenant.id}
                      customerPhone={c.customer_phone}
                      message={message}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="text-xs text-zinc-400">
        Clienții contactați sunt ascunși automat timp de 14 zile. Limită afișare: 50 clienți.
      </p>
    </div>
  );
}
