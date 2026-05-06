import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { readFiscal } from '@/lib/fiscal';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Romanian fiscal sales register export. Emits a SmartBill- or SAGA-friendly
// CSV for one calendar month, semicolon-delimited, decimal-comma, dd.mm.yyyy
// dates, UTF-8 BOM. Read-only over restaurant_orders — never mutates fiscal
// state. SAGA XML import is deferred to V2; the SAGA CSV here is a column
// shape the accountant can map at import time.
//
// Auth: OWNER on the active tenant. Service-role used only after the role
// check so the admin client cannot be tricked into reading another tenant's
// orders.
//
// VAT: schema has no per-row VAT field, so the rate is read from
// tenants.settings.fiscal.vat_rate_pct (default 9 for HoReCa) and applied
// inclusively against total_ron. Accountants who need a different rate per
// product line can edit the CSV directly; this is the standard SmartBill
// "single-rate" import shape.

const querySchema = z.object({
  year: z.string().regex(/^\d{4}$/),
  month: z.string().regex(/^\d{1,2}$/),
  format: z.enum(['smartbill', 'saga']),
});

type Format = 'smartbill' | 'saga';

const PAGE_SIZE = 1000;

// CSV injection guard — see existing apps/restaurant-admin/.../orders/export
// route for rationale. Also wrap any cell containing the chosen delimiter,
// quotes, CR or LF.
const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;

function csvCell(v: unknown, delimiter: string): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (FORMULA_PREFIX_RE.test(s)) s = `'${s}`;
  const needsQuote =
    s.includes(delimiter) || s.includes('"') || s.includes('\n') || s.includes('\r');
  return needsQuote ? `"${s.replace(/"/g, '""')}"` : s;
}

// Romanian decimal: comma. Two fractional digits. Used for all money cells.
function ronRo(n: number): string {
  return Number(n).toFixed(2).replace('.', ',');
}

// dd.mm.yyyy from a UTC ISO string. We anchor to Europe/Bucharest because
// fiscal day boundaries are local — an order placed at 23:30 EET on Jan 31
// belongs to January, not February. Intl + ro-RO gives us this with no
// extra dependency.
const RO_DATE_FMT = new Intl.DateTimeFormat('ro-RO', {
  timeZone: 'Europe/Bucharest',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function dateRo(iso: string): string {
  return RO_DATE_FMT.format(new Date(iso));
}

function monthBoundsUtc(year: number, monthIdxZeroBased: number): { startIso: string; endIso: string } {
  // Bucharest is UTC+2 (winter) / UTC+3 (summer). Build the local-midnight
  // boundary, then convert to UTC by subtracting the offset returned for
  // that wall-clock instant. We MUST compute the start and end offsets
  // independently — DST transitions never occur on the 1st of a month in
  // RO, but they do occur INSIDE March + October. For a March export the
  // end boundary (Apr 1 00:00 local) sits in EEST while the start boundary
  // (Mar 1 00:00 local) sits in EET, so reusing one offset for both shifts
  // the window by one hour. Caught by Codex review on PR #286.
  const localStart = new Date(Date.UTC(year, monthIdxZeroBased, 1, 0, 0, 0));
  const localEnd = new Date(Date.UTC(year, monthIdxZeroBased + 1, 1, 0, 0, 0));
  const startOffsetMin = bucharestOffsetMinutes(localStart);
  const endOffsetMin = bucharestOffsetMinutes(localEnd);
  const startIso = new Date(localStart.getTime() - startOffsetMin * 60_000).toISOString();
  const endIso = new Date(localEnd.getTime() - endOffsetMin * 60_000).toISOString();
  return { startIso, endIso };
}

function bucharestOffsetMinutes(at: Date): number {
  // Trick: render the same wall clock in UTC and Europe/Bucharest, diff them.
  const utc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }));
  const buc = new Date(at.toLocaleString('en-US', { timeZone: 'Europe/Bucharest' }));
  return (buc.getTime() - utc.getTime()) / 60_000;
}

type OrderRow = {
  id: string;
  created_at: string;
  total_ron: number | string;
  customers: { first_name: string | null; last_name: string | null } | null;
};

function customerName(r: OrderRow): string {
  const first = r.customers?.first_name?.trim() ?? '';
  const last = r.customers?.last_name?.trim() ?? '';
  const full = `${first} ${last}`.trim();
  return full.length > 0 ? full : 'Client persoană fizică';
}

function shortDocNumber(orderId: string, createdAt: string): string {
  // SmartBill expects a string; we use the order date prefix + first 8 chars
  // of the UUID so "Numar document" is stable + human-scannable across
  // reimports. Format: HIR-YYYYMMDD-XXXXXXXX.
  const d = new Date(createdAt);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `HIR-${y}${m}${day}-${orderId.slice(0, 8).toUpperCase()}`;
}

function buildSmartbillRow(
  r: OrderRow,
  vatRatePct: number,
  delimiter: string,
): string {
  // SmartBill single-line-per-document shape. Using the order total as a
  // single "Servicii livrare comandă" line keeps the import unambiguous —
  // accountants can split per product later if they need granularity.
  const total = Number(r.total_ron ?? 0);
  // Inclusive-VAT split: net = gross / (1 + rate); vat = gross - net.
  const net = total / (1 + vatRatePct / 100);
  const cells = [
    dateRo(r.created_at),
    shortDocNumber(r.id, r.created_at),
    customerName(r),
    '', // CUI — blank for B2C orders; SmartBill accepts blank
    'Servicii livrare comandă',
    '1', // Cantitate
    ronRo(total), // Pret unitar (gross)
    ronRo(net), // Valoare (net)
    String(vatRatePct), // Cota TVA
    ronRo(total), // Total cu TVA
  ];
  return cells.map((c) => csvCell(c, delimiter)).join(delimiter);
}

function buildSagaRow(
  r: OrderRow,
  vatRatePct: number,
  delimiter: string,
): string {
  // SAGA CSV approximation of <DocumenteIesire>. SAGA's bona-fide importer
  // is XML; CSV is documented as supported with a column shape similar to
  // this. Accountants on SAGA C/MICR confirm CSV import maps fine when the
  // header columns are explicit.
  const total = Number(r.total_ron ?? 0);
  const net = total / (1 + vatRatePct / 100);
  const vat = total - net;
  const cells = [
    'Bon fiscal', // Tip document
    shortDocNumber(r.id, r.created_at),
    dateRo(r.created_at),
    customerName(r),
    '', // CUI client
    'Servicii livrare comandă',
    '1', // Cantitate
    'buc', // UM
    ronRo(net), // Valoare fără TVA
    ronRo(vat), // Valoare TVA
    ronRo(total), // Valoare cu TVA
    `${vatRatePct}%`,
  ];
  return cells.map((c) => csvCell(c, delimiter)).join(delimiter);
}

const SMARTBILL_HEADERS = [
  'Data',
  'Numar document',
  'Client',
  'CUI',
  'Denumire produs',
  'Cantitate',
  'Pret unitar',
  'Valoare',
  'Cota TVA',
  'Total cu TVA',
];

const SAGA_HEADERS = [
  'Tip document',
  'Numar document',
  'Data',
  'Client',
  'CUI client',
  'Denumire produs',
  'Cantitate',
  'UM',
  'Valoare fara TVA',
  'Valoare TVA',
  'Valoare cu TVA',
  'Cota TVA',
];

export async function GET(req: NextRequest) {
  const { user, tenant } = await getActiveTenant().catch(() => ({ user: null, tenant: null }));
  if (!user || !tenant) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const role = await getTenantRole(user.id, tenant.id);
  if (role !== 'OWNER') {
    return NextResponse.json({ error: 'forbidden_owner_only' }, { status: 403 });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    year: url.searchParams.get('year') ?? '',
    month: url.searchParams.get('month') ?? '',
    format: url.searchParams.get('format') ?? '',
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
  }
  const year = Number(parsed.data.year);
  const month = Number(parsed.data.month);
  const format = parsed.data.format as Format;
  if (month < 1 || month > 12) {
    return NextResponse.json({ error: 'invalid_month' }, { status: 400 });
  }
  // Don't allow exporting future months; they are never useful and almost
  // always indicate a date-picker bug on the client.
  const now = new Date();
  const requested = new Date(Date.UTC(year, month - 1, 1));
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  if (requested.getTime() > thisMonth.getTime()) {
    return NextResponse.json({ error: 'future_month' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: tenantRow, error: tenantErr } = await admin
    .from('tenants')
    .select('settings, name')
    .eq('id', tenant.id)
    .single();
  if (tenantErr || !tenantRow) {
    console.error('[exports/sales-register] tenant_load_failed', tenantErr?.message);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  const fiscal = readFiscal(tenantRow.settings, tenantRow.name ?? tenant.name);

  const { startIso, endIso } = monthBoundsUtc(year, month - 1);

  // Stream rows page-by-page so we never load a full month into memory for
  // a busy tenant. PAGE_SIZE=1000 → 5k orders = 5 round trips, ~2 MB peak.
  const headers = format === 'smartbill' ? SMARTBILL_HEADERS : SAGA_HEADERS;
  const delimiter = ';';
  const lines: string[] = [headers.join(delimiter)];
  let totalRows = 0;
  let totalGross = 0;

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error } = await admin
      .from('restaurant_orders')
      .select('id, created_at, total_ron, customers(first_name, last_name)')
      .eq('tenant_id', tenant.id)
      .eq('status', 'DELIVERED')
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error('[exports/sales-register] db_error', error.message);
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
    }
    const rows = (page ?? []) as unknown as OrderRow[];
    for (const r of rows) {
      const line =
        format === 'smartbill'
          ? buildSmartbillRow(r, fiscal.vat_rate_pct, delimiter)
          : buildSagaRow(r, fiscal.vat_rate_pct, delimiter);
      lines.push(line);
      totalRows += 1;
      totalGross += Number(r.total_ron ?? 0);
    }
    if (rows.length < PAGE_SIZE) break;
  }

  // UTF-8 BOM so Excel RO renders diacritics; CRLF line endings so Excel
  // treats the file as a proper Windows CSV (not a single-line LF blob).
  const body = '﻿' + lines.join('\r\n') + '\r\n';
  const filename = `vanzari-${tenant.slug}-${year}-${String(month).padStart(2, '0')}-${format}.csv`;

  // Audit AFTER successful generation. Best-effort — never blocks the file.
  await logAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: 'fiscal.export_generated',
    entityType: 'tenant',
    entityId: tenant.id,
    metadata: {
      year,
      month,
      format,
      row_count: totalRows,
      total_gross_ron: Number(totalGross.toFixed(2)),
      vat_rate_pct: fiscal.vat_rate_pct,
    },
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Hir-Row-Count': String(totalRows),
    },
  });
}
