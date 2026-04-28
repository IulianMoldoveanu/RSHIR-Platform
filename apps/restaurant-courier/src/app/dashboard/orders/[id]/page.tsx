import { notFound } from 'next/navigation';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@hir/ui';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  acceptOrderAction,
  markPickedUpAction,
  markDeliveredAction,
} from '../../actions';

export const dynamic = 'force-dynamic';

type OrderDetail = {
  id: string;
  status: string;
  source_type: string;
  customer_first_name: string | null;
  customer_phone: string | null;
  pickup_line1: string | null;
  dropoff_line1: string | null;
  items: unknown;
  total_ron: number | null;
  delivery_fee_ron: number | null;
  payment_method: 'CARD' | 'COD' | null;
  assigned_courier_user_id: string | null;
};

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from('courier_orders')
    .select(
      'id, status, source_type, customer_first_name, customer_phone, pickup_line1, dropoff_line1, items, total_ron, delivery_fee_ron, payment_method, assigned_courier_user_id',
    )
    .eq('id', params.id)
    .maybeSingle();

  const order = data as OrderDetail | null;
  if (!order) notFound();

  const isMine = order.assigned_courier_user_id === user.id;
  const isAvailable =
    order.assigned_courier_user_id === null &&
    (order.status === 'CREATED' || order.status === 'OFFERED');

  const acceptBound = acceptOrderAction.bind(null, order.id);
  const pickedUpBound = markPickedUpAction.bind(null, order.id);
  const deliveredBound = markDeliveredAction.bind(null, order.id);

  const items = Array.isArray(order.items) ? (order.items as Array<{ name: string; quantity: number }>) : [];

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">Comandă</h1>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700">
          {order.status}
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Client</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>{order.customer_first_name ?? '—'}</p>
          {order.customer_phone ? (
            <a href={`tel:${order.customer_phone}`} className="text-purple-600 underline">
              {order.customer_phone}
            </a>
          ) : null}
          <p className="text-xs text-zinc-500">
            Sursă: {order.source_type} · Plată: {order.payment_method ?? '—'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ridicare</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">{order.pickup_line1 ?? '—'}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Livrare</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">{order.dropoff_line1 ?? '—'}</CardContent>
      </Card>

      {items.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Produse</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {items.map((it, i) => (
                <li key={i}>
                  {it.quantity}× {it.name}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Total</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>
            {order.total_ron != null ? `${Number(order.total_ron).toFixed(2)} RON` : '—'}
          </p>
          {order.delivery_fee_ron != null ? (
            <p className="text-xs text-zinc-500">
              Taxă livrare: {Number(order.delivery_fee_ron).toFixed(2)} RON
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {isAvailable ? (
          <form action={acceptBound}>
            <Button type="submit" className="w-full">
              Acceptă comanda
            </Button>
          </form>
        ) : null}

        {isMine && order.status === 'ACCEPTED' ? (
          <form action={pickedUpBound}>
            <Button type="submit" className="w-full">
              Am ridicat
            </Button>
          </form>
        ) : null}

        {isMine && (order.status === 'PICKED_UP' || order.status === 'IN_TRANSIT') ? (
          <form action={deliveredBound}>
            <Button type="submit" className="w-full">
              Am livrat
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
