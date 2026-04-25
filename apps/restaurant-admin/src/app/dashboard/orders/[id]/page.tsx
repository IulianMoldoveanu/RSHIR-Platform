import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';
import { nextStatuses, type OrderStatus } from '../actions';
import { StatusActions } from './status-actions';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'In asteptare',
  CONFIRMED: 'Confirmata',
  PREPARING: 'In preparare',
  READY: 'Gata',
  DISPATCHED: 'Trimisa',
  IN_DELIVERY: 'In livrare',
  DELIVERED: 'Livrata',
  CANCELLED: 'Anulata',
};

const PAYMENT_LABEL: Record<string, string> = {
  UNPAID: 'Neplatita',
  PAID: 'Platita',
  REFUNDED: 'Rambursata',
  FAILED: 'Esuata',
};

type OrderItemSnapshot = {
  name?: string;
  qty?: number;
  quantity?: number;
  price_ron?: number;
  price?: number;
  unit_price?: number;
  modifiers?: Array<{ name?: string; price_delta_ron?: number }>;
  notes?: string;
};

function formatRon(n: number | string | null | undefined): string {
  return `${Number(n ?? 0).toFixed(2)} RON`;
}

function lastInitial(s: string | null): string {
  if (!s) return '';
  const c = s.trim().charAt(0);
  return c ? `${c.toUpperCase()}.` : '';
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function publicTrackUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_RESTAURANT_WEB_URL ?? '';
  if (!base) return `/track/${token}`;
  return `${base.replace(/\/$/, '')}/track/${token}`;
}

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const { tenant } = await getActiveTenant();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('restaurant_orders')
    .select(
      `
        id, tenant_id, status, payment_status, items,
        subtotal_ron, delivery_fee_ron, total_ron, notes,
        public_track_token, created_at, updated_at,
        customers ( first_name, last_name, phone ),
        customer_addresses ( line1, line2, city, postal_code )
      `,
    )
    .eq('id', params.id)
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) notFound();

  const order = data as unknown as {
    id: string;
    status: OrderStatus;
    payment_status: string;
    items: OrderItemSnapshot[] | unknown;
    subtotal_ron: number;
    delivery_fee_ron: number;
    total_ron: number;
    notes: string | null;
    public_track_token: string;
    created_at: string;
    updated_at: string;
    customers: { first_name: string | null; last_name: string | null; phone: string | null } | null;
    customer_addresses: {
      line1: string | null;
      line2: string | null;
      city: string | null;
      postal_code: string | null;
    } | null;
  };

  const items = Array.isArray(order.items) ? (order.items as OrderItemSnapshot[]) : [];
  const allowedNext = nextStatuses(order.status);
  const cancellable = order.status !== 'DELIVERED' && order.status !== 'CANCELLED';
  const trackUrl = publicTrackUrl(order.public_track_token);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/dashboard/orders" className="text-xs text-zinc-500 hover:text-zinc-900">
          ← Inapoi la comenzi
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Comanda #{shortId(order.id)}
          </h1>
          <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] font-medium text-white">
            {STATUS_LABEL[order.status]}
          </span>
        </div>
        <p className="text-xs text-zinc-500">
          Creata {new Date(order.created_at).toLocaleString('ro-RO')}
        </p>
      </header>

      <section className="rounded-md border border-zinc-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">Tranzitii</h2>
        <StatusActions
          orderId={order.id}
          current={order.status}
          nextOptions={allowedNext}
          cancellable={cancellable}
        />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-md border border-zinc-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Produse</h2>
          {items.length === 0 ? (
            <p className="text-xs text-zinc-500">Fara linii.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-zinc-100 text-sm">
              {items.map((it, idx) => {
                const qty = Number(it.qty ?? it.quantity ?? 1);
                const unit = Number(it.price_ron ?? it.unit_price ?? it.price ?? 0);
                return (
                  <li key={idx} className="flex flex-col gap-1 py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-zinc-900">
                        {qty} × {it.name ?? 'Produs'}
                      </span>
                      <span className="text-zinc-700">{formatRon(unit * qty)}</span>
                    </div>
                    {Array.isArray(it.modifiers) && it.modifiers.length > 0 && (
                      <ul className="ml-4 text-xs text-zinc-500">
                        {it.modifiers.map((m, i) => (
                          <li key={i}>
                            + {m.name}
                            {m.price_delta_ron ? ` (${formatRon(m.price_delta_ron)})` : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                    {it.notes && <p className="text-xs italic text-zinc-500">{it.notes}</p>}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3 flex flex-col gap-1 border-t border-zinc-100 pt-3 text-sm">
            <Row label="Subtotal" value={formatRon(order.subtotal_ron)} />
            <Row label="Livrare" value={formatRon(order.delivery_fee_ron)} />
            <Row label="Total" value={formatRon(order.total_ron)} bold />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="rounded-md border border-zinc-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-zinc-900">Client</h2>
            {order.customers ? (
              <div className="text-sm text-zinc-700">
                <p>
                  {(order.customers.first_name ?? 'Anonim').trim()}{' '}
                  {lastInitial(order.customers.last_name ?? null)}
                </p>
                {order.customers.phone && (
                  <p className="text-xs text-zinc-500">{order.customers.phone}</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-zinc-500">Fara client asociat.</p>
            )}
          </div>

          <div className="rounded-md border border-zinc-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-zinc-900">Adresa de livrare</h2>
            {order.customer_addresses ? (
              <div className="text-sm text-zinc-700">
                <p>{order.customer_addresses.line1}</p>
                {order.customer_addresses.line2 && <p>{order.customer_addresses.line2}</p>}
                <p className="text-xs text-zinc-500">
                  {[order.customer_addresses.postal_code, order.customer_addresses.city]
                    .filter(Boolean)
                    .join(' • ')}
                </p>
              </div>
            ) : (
              <p className="text-xs text-zinc-500">Fara adresa.</p>
            )}
          </div>

          <div className="rounded-md border border-zinc-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-zinc-900">Plata</h2>
            <p className="text-sm text-zinc-700">
              {PAYMENT_LABEL[order.payment_status] ?? order.payment_status}
            </p>
          </div>

          <div className="rounded-md border border-zinc-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-zinc-900">Link tracking public</h2>
            <a
              href={trackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-xs text-blue-600 underline hover:text-blue-700"
            >
              {trackUrl}
            </a>
          </div>

          {order.notes && (
            <div className="rounded-md border border-zinc-200 bg-white p-4">
              <h2 className="mb-2 text-sm font-semibold text-zinc-900">Note</h2>
              <p className="whitespace-pre-wrap text-sm text-zinc-700">{order.notes}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={'flex items-center justify-between ' + (bold ? 'font-semibold text-zinc-900' : 'text-zinc-600')}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
