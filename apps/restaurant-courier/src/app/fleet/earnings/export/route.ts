import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFleetManager } from '@/lib/fleet-manager';

export const dynamic = 'force-dynamic';

type DeliveredRow = {
  id: string;
  total_ron: number | null;
  delivery_fee_ron: number | null;
  payment_method: 'CARD' | 'COD' | null;
  vertical: string | null;
  customer_first_name: string | null;
  pickup_line1: string | null;
  dropoff_line1: string | null;
  assigned_courier_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type CourierRow = {
  user_id: string;
  full_name: string | null;
};

// CSV-escape a single field: doubles internal quotes, wraps in quotes
// when content contains delimiters / newlines / quotes. Excel-friendly.
function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r;]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Returns the start-of-day Date for `daysAgo` days ago in the server's
// local timezone. The Brașov pilot is the only consumer for now and
// runs in Europe/Bucharest, so this is good enough.
function startOfDay(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Manager-only CSV export of delivered orders, scoped to the manager's
 * fleet. Default range: last 30 days. Override with `?days=N` (capped
 * at 365 to keep response sizes sane).
 *
 * Returns a `text/csv` body with a Content-Disposition attachment so
 * a direct browser hit triggers a download.
 */
export async function GET(request: Request) {
  const fleet = await requireFleetManager();
  const admin = createAdminClient();

  const url = new URL(request.url);
  const daysParam = Number(url.searchParams.get('days') ?? '30');
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(1, Math.floor(daysParam)), 365) : 30;

  const since = startOfDay(days - 1);

  const [{ data: ordersData }, { data: couriersData }] = await Promise.all([
    admin
      .from('courier_orders')
      .select(
        'id, total_ron, delivery_fee_ron, payment_method, vertical, customer_first_name, pickup_line1, dropoff_line1, assigned_courier_user_id, created_at, updated_at',
      )
      .eq('fleet_id', fleet.fleetId)
      .eq('status', 'DELIVERED')
      .gte('updated_at', since.toISOString())
      .order('updated_at', { ascending: false })
      .limit(5000),
    admin
      .from('courier_profiles')
      .select('user_id, full_name')
      .eq('fleet_id', fleet.fleetId),
  ]);

  const orders = (ordersData ?? []) as DeliveredRow[];
  const couriers = (couriersData ?? []) as CourierRow[];
  const courierName = new Map(couriers.map((c) => [c.user_id, c.full_name ?? '']));

  const headers = [
    'order_id',
    'delivered_at',
    'created_at',
    'vertical',
    'courier',
    'customer',
    'pickup',
    'dropoff',
    'total_ron',
    'delivery_fee_ron',
    'payment_method',
  ];

  const lines: string[] = [headers.join(',')];
  for (const o of orders) {
    const row = [
      csvField(o.id),
      csvField(o.updated_at),
      csvField(o.created_at),
      csvField(o.vertical ?? ''),
      csvField(
        o.assigned_courier_user_id
          ? (courierName.get(o.assigned_courier_user_id) ?? o.assigned_courier_user_id)
          : '',
      ),
      csvField(o.customer_first_name ?? ''),
      csvField(o.pickup_line1 ?? ''),
      csvField(o.dropoff_line1 ?? ''),
      csvField(o.total_ron ?? ''),
      csvField(o.delivery_fee_ron ?? ''),
      csvField(o.payment_method ?? ''),
    ];
    lines.push(row.join(','));
  }

  // Excel reads UTF-8 if and only if the file starts with a BOM.
  // Without it, Romanian diacritics (Brașov, Tudor Vladimirescu, …) get
  // mojibake. Cheap fix; no downside for other consumers (LibreOffice,
  // pandas, etc. all strip the BOM transparently).
  const body = '﻿' + lines.join('\n');

  const today = new Date().toISOString().slice(0, 10);
  const filename = `fleet-${fleet.slug}-livrari-${today}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
