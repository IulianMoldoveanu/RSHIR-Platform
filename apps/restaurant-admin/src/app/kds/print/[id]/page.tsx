import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';
import type { OrderStatus } from '../../../dashboard/orders/actions';
import { AutoPrint } from './auto-print';
import './print.css';

export const dynamic = 'force-dynamic';

type ItemSnapshot = {
  name?: string;
  qty?: number;
  quantity?: number;
  price_ron?: number;
  price?: number;
  unit_price?: number;
  modifiers?: Array<{ name?: string; price_delta_ron?: number }>;
  notes?: string;
};

type Row = {
  id: string;
  status: OrderStatus;
  items: unknown;
  notes: string | null;
  subtotal_ron: number;
  delivery_fee_ron: number;
  total_ron: number;
  created_at: string;
  delivery_address_id: string | null;
};

function shortId(id: string): string {
  return id.slice(0, 8);
}

function formatRon(n: number | string | null | undefined): string {
  return `${Number(n ?? 0).toFixed(2)} RON`;
}

export default async function PrintReceiptPage({ params }: { params: { id: string } }) {
  const { tenant } = await getActiveTenant();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('restaurant_orders')
    .select(
      'id, status, items, notes, subtotal_ron, delivery_fee_ron, total_ron, created_at, delivery_address_id',
    )
    .eq('id', params.id)
    .eq('tenant_id', tenant.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) notFound();

  const order = data as unknown as Row;
  const items = Array.isArray(order.items) ? (order.items as ItemSnapshot[]) : [];
  const fulfillment = order.delivery_address_id ? 'Livrare' : 'Ridicare';

  return (
    <div className="kds-receipt">
      <AutoPrint />

      <h1>{tenant.name}</h1>
      <div className="meta">
        Comanda #{shortId(order.id)}
        <br />
        {new Date(order.created_at).toLocaleString('ro-RO')}
        <br />
        {fulfillment}
      </div>

      <hr />

      <ul>
        {items.map((it, idx) => {
          const qty = Number(it.qty ?? it.quantity ?? 1);
          const unit = Number(it.price_ron ?? it.unit_price ?? it.price ?? 0);
          return (
            <li key={idx}>
              <div>
                {qty}× {it.name ?? 'Produs'}{' '}
                <span style={{ float: 'right' }}>{formatRon(unit * qty)}</span>
              </div>
              {Array.isArray(it.modifiers) && it.modifiers.length > 0 && (
                <div className="mods">
                  {it.modifiers.map((m, i) => (
                    <div key={i}>+ {m.name}</div>
                  ))}
                </div>
              )}
              {it.notes && <div className="mods">// {it.notes}</div>}
            </li>
          );
        })}
      </ul>

      <hr />

      <div>
        Subtotal <span style={{ float: 'right' }}>{formatRon(order.subtotal_ron)}</span>
      </div>
      <div>
        Livrare <span style={{ float: 'right' }}>{formatRon(order.delivery_fee_ron)}</span>
      </div>
      <div style={{ fontWeight: 700, marginTop: '2mm' }}>
        TOTAL <span style={{ float: 'right' }}>{formatRon(order.total_ron)}</span>
      </div>

      {order.notes && <div className="notes">Notă: {order.notes}</div>}

      <hr />
      <div className="meta kds-no-print" style={{ marginTop: '4mm' }}>
        Folosește dialogul de printare al browserului (Ctrl+P).
      </div>
    </div>
  );
}
