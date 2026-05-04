import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getActiveTenant, assertTenantMember } from '@/lib/tenant';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// RSHIR-47: orders CSV export for accounting / external tools.
// Default window: last 90 days. Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD.
// Tenant-scoped via tenant_member auth (no service-role bypass for the
// authorization decision; rows still loaded with the admin client because
// orders join customers + addresses which RLS would block).

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

type Item = {
  name?: string;
  item_name?: string;
  qty?: number;
  quantity?: number;
  line_total_ron?: number;
};

// CSV injection guard: Excel/Sheets/LibreOffice interpret cells starting
// with `=`, `+`, `-`, `@`, or a leading tab/CR as formulas — a malicious
// customer note like `=HYPERLINK("https://evil")` would execute on open.
// Prefix any such value with a single quote, which the spreadsheet will
// strip on open. See OWASP "Formula Injection".
const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (FORMULA_PREFIX_RE.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function summarizeItems(items: unknown): string {
  if (!Array.isArray(items)) return '';
  const parts: string[] = [];
  for (const it of items as Item[]) {
    const qty = Number(it.qty ?? it.quantity ?? 1);
    const name = it.name ?? it.item_name ?? '?';
    parts.push(`${qty}x ${name}`);
  }
  return parts.join('; ');
}

export async function GET(req: NextRequest) {
  const { user, tenant } = await getActiveTenant().catch(() => ({ user: null, tenant: null }));
  if (!user || !tenant) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  await assertTenantMember(user.id, tenant.id);

  const url = new URL(req.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  if (fromParam && !dateSchema.safeParse(fromParam).success) {
    return NextResponse.json({ error: 'invalid_from' }, { status: 400 });
  }
  if (toParam && !dateSchema.safeParse(toParam).success) {
    return NextResponse.json({ error: 'invalid_to' }, { status: 400 });
  }

  // Default window: last 90 days, ending today (UTC).
  const end = toParam ? new Date(`${toParam}T23:59:59Z`) : new Date();
  const start = fromParam
    ? new Date(`${fromParam}T00:00:00Z`)
    : new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);

  const admin = createAdminClient();
  // Defensive SELECT: try with payment_method (20260504_001 column); fall
  // back to legacy columns if the migration hasn't shipped. CSV exports
  // generated pre-migration just have an empty payment_method column.
  const COLS_FULL = `
    id, created_at, status, payment_status, payment_method, items,
    subtotal_ron, delivery_fee_ron, discount_ron, total_ron, notes,
    customers ( first_name, last_name, phone ),
    customer_addresses ( line1, city )
  `;
  const COLS_LEGACY = `
    id, created_at, status, payment_status, items,
    subtotal_ron, delivery_fee_ron, discount_ron, total_ron, notes,
    customers ( first_name, last_name, phone ),
    customer_addresses ( line1, city )
  `;
  const loadRows = (cols: string) =>
    admin
      .from('restaurant_orders')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select(cols as any)
      .eq('tenant_id', tenant.id)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .order('created_at', { ascending: false });
  let { data: rows, error } = await loadRows(COLS_FULL);
  if (error && /payment_method/i.test(error.message ?? '')) {
    ({ data: rows, error } = await loadRows(COLS_LEGACY));
  }

  if (error) {
    // Don't echo Supabase error.message — leaks column/constraint names. Log
    // server-side, return generic 500.
    console.error('[dashboard/orders/export] db_error', error.message);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  const headers = [
    'id',
    'created_at',
    'status',
    'payment_method',
    'payment_status',
    'customer_name',
    'customer_phone',
    'delivery_city',
    'delivery_address',
    'items_summary',
    'subtotal_ron',
    'delivery_fee_ron',
    'discount_ron',
    'total_ron',
    'notes',
  ];

  const lines = [headers.join(',')];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (rows ?? []) as any[]) {
    const customerName =
      [r.customers?.first_name, r.customers?.last_name].filter(Boolean).join(' ').trim() || '';
    const cells = [
      r.id,
      r.created_at,
      r.status,
      r.payment_method ?? '',
      r.payment_status,
      customerName,
      r.customers?.phone ?? '',
      r.customer_addresses?.city ?? '',
      r.customer_addresses?.line1 ?? '',
      summarizeItems(r.items),
      Number(r.subtotal_ron ?? 0).toFixed(2),
      Number(r.delivery_fee_ron ?? 0).toFixed(2),
      Number(r.discount_ron ?? 0).toFixed(2),
      Number(r.total_ron ?? 0).toFixed(2),
      r.notes ?? '',
    ];
    lines.push(cells.map(escapeCsv).join(','));
  }

  // Excel-friendly UTF-8 BOM so RO diacritics render in default Excel install.
  const body = '﻿' + lines.join('\r\n');
  const filename = `comenzi-${tenant.slug}-${start.toISOString().slice(0, 10)}_to_${end.toISOString().slice(0, 10)}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
