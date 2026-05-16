import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Haversine straight-line distance in km between two GPS coordinates.
 * Used as a reasonable proxy for route distance when actual route data is
 * unavailable. Matches the formula used in EarningsPreview.
 */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * CSV-escape a single field.
 * - Prefixes `=`, `+`, `-`, `@`, tab, CR with a literal apostrophe to block
 *   spreadsheet formula injection (Excel/Sheets/LibreOffice).
 * - Wraps in double-quotes when the value contains `;`, `"`, or newlines.
 * Uses `;` as delimiter (Excel RO locale default).
 */
function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (/[";,\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Format a number in RO locale decimal style: comma separator. */
function roDecimal(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

type OrderRow = {
  id: string;
  delivery_fee_ron: number | null;
  updated_at: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  source_tenant_id: string | null;
};

// ── route ─────────────────────────────────────────────────────────────────────

/**
 * GET /dashboard/earnings/export
 *
 * Query params:
 *   year  - YYYY (required)
 *   month - MM, 1-12 (optional; when omitted returns the full year)
 *
 * Returns a UTF-8 BOM CSV with `;` delimiter, one row per calendar day that
 * had at least one delivered order. Columns:
 *   data ; numar_comenzi ; total_km ; venit_brut_ron ; comision_HIR_ron ; venit_net_ron
 *
 * Filename: hir-curier-venituri-{YYYY-MM|YYYY}-{userId8}.csv
 *
 * Writes a best-effort audit_log row (skipped silently when no tenant_id can
 * be derived from the period's orders — matches existing courier audit behaviour
 * for non-order-scoped events).
 */
export async function GET(request: NextRequest) {
  // ── auth ──────────────────────────────────────────────────────────────────
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Neautorizat' }, { status: 401 });
  }

  // ── parse params ──────────────────────────────────────────────────────────
  const url = new URL(request.url);
  const yearParam = url.searchParams.get('year');
  const monthParam = url.searchParams.get('month');

  const now = new Date();
  const year = yearParam ? parseInt(yearParam, 10) : now.getFullYear();
  const month = monthParam ? parseInt(monthParam, 10) : null; // 1-12 or null = full year

  if (!Number.isInteger(year) || year < 2020 || year > now.getFullYear() + 1) {
    return NextResponse.json({ error: 'An invalid' }, { status: 400 });
  }
  if (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) {
    return NextResponse.json({ error: 'Luna invalida' }, { status: 400 });
  }

  // Time bounds (UTC).
  const periodStart =
    month !== null
      ? new Date(Date.UTC(year, month - 1, 1))
      : new Date(Date.UTC(year, 0, 1));
  const periodEnd =
    month !== null
      ? new Date(Date.UTC(year, month, 1)) // exclusive
      : new Date(Date.UTC(year + 1, 0, 1));

  // ── query ─────────────────────────────────────────────────────────────────
  const admin = createAdminClient();

  const { data: ordersData, error } = await admin
    .from('courier_orders')
    .select(
      'id, delivery_fee_ron, updated_at, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, source_tenant_id',
    )
    .eq('assigned_courier_user_id', user.id)
    .eq('status', 'DELIVERED')
    .gte('updated_at', periodStart.toISOString())
    .lt('updated_at', periodEnd.toISOString())
    .order('updated_at', { ascending: true })
    .limit(10_000);

  if (error) {
    console.error('[earnings-export] query error', error.message);
    return NextResponse.json({ error: 'Eroare interogare' }, { status: 500 });
  }

  const orders = (ordersData ?? []) as OrderRow[];

  // ── aggregate per calendar day ────────────────────────────────────────────
  const byDay = new Map<
    string,
    { count: number; totalKm: number; grossRon: number }
  >();

  for (const o of orders) {
    const d = new Date(o.updated_at);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const key = `${yyyy}-${mm}-${dd}`;

    const km =
      o.pickup_lat != null &&
      o.pickup_lng != null &&
      o.dropoff_lat != null &&
      o.dropoff_lng != null
        ? haversineKm(o.pickup_lat, o.pickup_lng, o.dropoff_lat, o.dropoff_lng)
        : 0;

    const fee = Number(o.delivery_fee_ron) || 0;

    const acc = byDay.get(key) ?? { count: 0, totalKm: 0, grossRon: 0 };
    acc.count += 1;
    acc.totalKm += km;
    acc.grossRon += fee;
    byDay.set(key, acc);
  }

  const sortedDays = [...byDay.keys()].sort();

  // ── build CSV ─────────────────────────────────────────────────────────────
  const DELIMITER = ';';
  const headers = [
    'data',
    'numar_comenzi',
    'total_km',
    'venit_brut_ron',
    'comision_HIR_ron',
    'venit_net_ron',
  ].join(DELIMITER);

  const lines: string[] = [headers];

  for (const day of sortedDays) {
    const { count, totalKm, grossRon } = byDay.get(day)!;
    // Commission is 0 today. Column is kept so the schema stays stable when
    // a per-courier commission model is introduced later.
    const commissionRon = 0;
    const netRon = grossRon - commissionRon;
    lines.push(
      [
        csvField(day),
        csvField(count),
        csvField(roDecimal(totalKm)),
        csvField(roDecimal(grossRon)),
        csvField(roDecimal(commissionRon)),
        csvField(roDecimal(netRon)),
      ].join(DELIMITER),
    );
  }

  // UTF-8 BOM so Excel RO opens without mojibake on diacritics.
  const body = '﻿' + lines.join('\r\n');

  // ── filename ──────────────────────────────────────────────────────────────
  const periodLabel =
    month !== null
      ? `${year}-${String(month).padStart(2, '0')}`
      : String(year);
  const userShort = user.id.replace(/-/g, '').slice(0, 8);
  const filename = `hir-curier-venituri-${periodLabel}-${userShort}.csv`;

  // ── audit log (best-effort) ───────────────────────────────────────────────
  // audit_log.tenant_id is NOT NULL. We derive a tenant_id from the first
  // delivered order in the period that has one. If none found we skip the row
  // silently — same contract as existing courier audit for non-order events.
  void (async () => {
    try {
      const firstWithTenant = orders.find((o) => o.source_tenant_id != null);
      const tenantId = firstWithTenant?.source_tenant_id ?? null;
      if (!tenantId) return;

      const sb = admin as unknown as {
        from: (t: string) => {
          insert: (
            row: Record<string, unknown>,
          ) => Promise<{ error: { message: string } | null }>;
        };
      };
      await sb.from('audit_log').insert({
        tenant_id: tenantId,
        actor_user_id: user.id,
        action: 'earnings.exported',
        entity_type: 'courier_export',
        entity_id: null,
        metadata: {
          period: periodLabel,
          format: 'csv',
          row_count: orders.length,
          day_count: sortedDays.length,
        },
      });
    } catch (e) {
      console.error('[earnings-export] audit insert failed', e);
    }
  })();

  // ── response ──────────────────────────────────────────────────────────────
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
