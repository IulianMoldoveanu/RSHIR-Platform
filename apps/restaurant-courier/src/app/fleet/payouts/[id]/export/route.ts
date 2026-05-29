import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFleetManager } from '@/lib/fleet-manager';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

type ItemRow = {
  id: string;
  amount_cents: number;
  delivery_pricings: {
    delivery_id: string;
    computed_at: string;
  } | null;
};

// Same CSV-injection / quoting rules as fleet/earnings/export.
function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n\r;]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Per-period export — gives the fleet manager a CSV they can hand to
 * their bank or e-banking portal. NOT a full SEPA XML (pain.001) — that
 * needs per-courier IBANs which we don't store yet. This CSV mirrors the
 * structure of the e-banking bulk-upload templates from BCR / BT /
 * Revolut Business: one row per beneficiary (here: one row per delivery
 * item, manager aggregates if needed).
 *
 * Follow-up (out of MVP scope): once `courier_profiles.iban` lands,
 * collapse the rows into one-per-courier with their IBAN inline.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const fleet = await requireFleetManager();
  const admin = createAdminClient();

  const { id: periodId } = await context.params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data: periodData } = await sb
    .from('payout_periods')
    .select(
      'id, courier_user_id, period_start, period_end, total_cents, status, payment_ref',
    )
    .eq('id', periodId)
    .maybeSingle();

  if (!periodData) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Same fleet-membership check as the detail page — never leak amounts
  // for couriers outside the manager's fleet.
  const { data: profile } = await sb
    .from('courier_profiles')
    .select('user_id, full_name')
    .eq('user_id', periodData.courier_user_id)
    .eq('fleet_id', fleet.fleetId)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const courierName = (profile as { full_name: string | null }).full_name ?? '';

  const { data: itemsData } = await sb
    .from('payout_items')
    .select(
      'id, amount_cents, delivery_pricings ( delivery_id, computed_at )',
    )
    .eq('payout_period_id', periodId)
    .order('id', { ascending: true });

  const items = (itemsData ?? []) as ItemRow[];

  const headers = [
    'period_id',
    'courier_name',
    'period_start',
    'period_end',
    'payout_item_id',
    'delivery_id',
    'computed_at',
    'amount_ron',
  ];
  const lines: string[] = [headers.join(',')];

  for (const it of items) {
    const amountRon = (it.amount_cents / 100).toFixed(2);
    lines.push(
      [
        csvField(periodData.id),
        csvField(courierName),
        csvField(periodData.period_start),
        csvField(periodData.period_end),
        csvField(it.id),
        csvField(it.delivery_pricings?.delivery_id ?? ''),
        csvField(it.delivery_pricings?.computed_at ?? ''),
        csvField(amountRon),
      ].join(','),
    );
  }

  // Aggregate row at the bottom so the manager has a checksum vs the
  // period's total_cents (catch silent drift between items and total).
  const sum = items.reduce((acc, it) => acc + it.amount_cents, 0);
  lines.push(
    [
      csvField(periodData.id),
      csvField(courierName),
      csvField(periodData.period_start),
      csvField(periodData.period_end),
      csvField('TOTAL'),
      '',
      '',
      csvField((sum / 100).toFixed(2)),
    ].join(','),
  );

  // Same UTF-8 BOM as fleet/earnings/export so Excel reads diacritics.
  const body = '﻿' + lines.join('\n');

  const dateSlug = periodData.period_end.slice(0, 10);
  const courierSlug = courierName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'courier';
  const filename = `payout-${fleet.slug}-${courierSlug}-${dateSlug}.csv`;

  // Audit the export so a download trail exists for reconciliation /
  // compliance — same convention as earnings.exported.
  await logAudit({
    actorUserId: fleet.userId,
    action: 'fleet.payouts_exported',
    entityType: 'payout_period',
    entityId: periodId,
    metadata: {
      fleet_id: fleet.fleetId,
      courier_user_id: periodData.courier_user_id,
      item_count: items.length,
      total_cents: sum,
    },
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
