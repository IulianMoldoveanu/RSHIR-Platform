'use server';

// Partner payouts ledger — server actions.
//
// `partner_payouts` is a separate ledger from `partner_commissions`:
//   - `partner_commissions` holds per-referral monthly calculations
//     populated by the cron `partner-commission-calc` Edge Function.
//   - `partner_payouts` records the act of paying a partner for a
//     calendar month: who paid, when, amount, optional proof URL.
//
// One non-voided row per (partner_id, period_month). A voided payout
// keeps its row for audit but releases the unique slot so the operator
// can record a corrected payout for the same month.

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';
import { requirePlatformAdmin as requirePlatformAdminShared } from '@/lib/auth/platform-admin';
import { isValidHttpsUrl, normalizePeriodMonth } from './payout-helpers';

const REVALIDATE = '/dashboard/admin/partners';
// Partner tables are platform-level, not tenant-scoped. The audit
// helper swallows FK violations, so we pass the existing platform
// sentinel UUID (mirrors the rest of partners/actions.ts).
const PLATFORM_SENTINEL_TENANT = '00000000-0000-0000-0000-000000000000';

// ────────────────────────────────────────────────────────────
// Platform-admin gate (thin shim for consistent error copy)
// ────────────────────────────────────────────────────────────

async function requirePlatformAdmin(): Promise<
  { ok: true; userId: string; email: string } | { ok: false; error: string }
> {
  const r = await requirePlatformAdminShared();
  if (!r.ok) {
    return {
      ok: false,
      error: r.status === 401
        ? 'Unauthentificat.'
        : 'Acces interzis: nu ești administrator de platformă.',
    };
  }
  return { ok: true, userId: r.userId, email: r.email };
}

// ────────────────────────────────────────────────────────────
// Typed cast helper (partner_payouts not in generated types yet)
// ────────────────────────────────────────────────────────────

type PayoutClient = {
  from: (t: string) => {
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => {
        single: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string; code?: string } | null;
        }>;
      };
    };
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => {
        is: (col: string, val: null) => Promise<{
          error: { message: string } | null;
          data: Record<string, unknown>[] | null;
          count: number | null;
        }>;
      };
    };
  };
};

function adminSb(): PayoutClient {
  return createAdminClient() as unknown as PayoutClient;
}

export type PayoutActionResult =
  | { ok: true; payoutId: string }
  | { ok: false; error: string };

export type VoidPayoutResult =
  | { ok: true }
  | { ok: false; error: string };

// ────────────────────────────────────────────────────────────
// markCommissionPaidAction — record a payout row for a partner/month.
// ────────────────────────────────────────────────────────────

export async function markCommissionPaidAction(input: {
  partner_id: string;
  period_month: string; // 'YYYY-MM' or 'YYYY-MM-01'
  gross_cents: number;
  platform_fee_cents?: number;
  proof_url?: string;
  notes?: string;
}): Promise<PayoutActionResult> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  // ── Validate inputs ─────────────────────────────────────
  if (!input.partner_id || typeof input.partner_id !== 'string') {
    return { ok: false, error: 'partner_id lipsește.' };
  }
  const period = normalizePeriodMonth(input.period_month);
  if (!period) {
    return { ok: false, error: 'Lună invalidă (format așteptat YYYY-MM).' };
  }
  if (!Number.isFinite(input.gross_cents) || input.gross_cents < 0) {
    return { ok: false, error: 'Suma gross trebuie să fie un număr ≥ 0.' };
  }
  const fee = input.platform_fee_cents ?? 0;
  if (!Number.isFinite(fee) || fee < 0) {
    return { ok: false, error: 'Comisionul platformei trebuie să fie ≥ 0.' };
  }
  if (fee > input.gross_cents) {
    return { ok: false, error: 'Comisionul platformei nu poate depăși suma gross.' };
  }
  if (input.proof_url && input.proof_url.trim() && !isValidHttpsUrl(input.proof_url.trim())) {
    return { ok: false, error: 'proof_url trebuie să fie un URL http(s) valid.' };
  }

  const grossCents = Math.round(input.gross_cents);
  const platformFeeCents = Math.round(fee);
  const netCents = grossCents - platformFeeCents;

  // ── Insert ───────────────────────────────────────────────
  const sb = adminSb();
  const { data, error } = await sb
    .from('partner_payouts')
    .insert({
      partner_id: input.partner_id,
      period_month: period,
      gross_cents: grossCents,
      platform_fee_cents: platformFeeCents,
      net_cents: netCents,
      paid_by_user_id: guard.userId,
      proof_url: input.proof_url?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .select('id')
    .single();

  if (error) {
    // 23505 = unique_violation → already paid for this month.
    if (
      error.code === '23505' ||
      /duplicate|unique|partner_payouts_partner_month_active_unique/i.test(error.message ?? '')
    ) {
      return {
        ok: false,
        error: 'Există deja un payout activ pentru acest partener în luna selectată.',
      };
    }
    return { ok: false, error: error.message };
  }

  const payoutId = String(data?.id ?? '');

  await logAudit({
    tenantId: PLATFORM_SENTINEL_TENANT,
    actorUserId: guard.userId,
    action: 'partner.payout_marked_paid',
    entityType: 'partner_payout',
    entityId: payoutId,
    metadata: {
      partner_id: input.partner_id,
      period_month: period,
      gross_cents: grossCents,
      platform_fee_cents: platformFeeCents,
      net_cents: netCents,
      proof_url: input.proof_url?.trim() || null,
    },
  });

  revalidatePath(REVALIDATE);
  return { ok: true, payoutId };
}

// ────────────────────────────────────────────────────────────
// voidPayoutAction — soft-void an existing payout row.
// ────────────────────────────────────────────────────────────

export async function voidPayoutAction(input: {
  payout_id: string;
  reason?: string;
}): Promise<VoidPayoutResult> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  if (!input.payout_id || typeof input.payout_id !== 'string') {
    return { ok: false, error: 'payout_id lipsește.' };
  }

  const sb = adminSb();
  const { error } = await sb
    .from('partner_payouts')
    .update({
      voided_at: new Date().toISOString(),
      voided_by_user_id: guard.userId,
      voided_reason: input.reason?.trim() || null,
    })
    .eq('id', input.payout_id)
    .is('voided_at', null);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    tenantId: PLATFORM_SENTINEL_TENANT,
    actorUserId: guard.userId,
    action: 'partner.payout_voided',
    entityType: 'partner_payout',
    entityId: input.payout_id,
    metadata: { reason: input.reason?.trim() || null },
  });

  revalidatePath(REVALIDATE);
  return { ok: true };
}

// Test surface: pure helpers live in ./payout-helpers and are imported
// directly by the test file. Re-exporting a non-async value here would
// violate the 'use server' contract Next.js 15 enforces — see
// payout-helpers.ts for the full reasoning.
