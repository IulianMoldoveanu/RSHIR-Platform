'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTenantMember, getActiveTenant } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';
import {
  notifyCustomerOfReservationDecision,
  type DecisionKind,
} from '@/lib/email/reservation-emails';

const decisionSchema = z.object({
  reservationId: z.string().uuid(),
  expectedTenantId: z.string().uuid(),
  rejectionReason: z.string().max(500).optional(),
});

const settingsSchema = z.object({
  tenantId: z.string().uuid(),
  is_enabled: z.boolean(),
  advance_max_days: z.number().int().min(0).max(365),
  advance_min_minutes: z.number().int().min(0).max(10080),
  slot_duration_min: z.number().int().min(15).max(480),
  party_size_max: z.number().int().min(1).max(100),
  capacity_per_slot: z.number().int().min(1).max(1000),
  notify_email: z.string().email().or(z.literal('')).optional(),
});

export type ResvActionResult = { ok: true } | { ok: false; error: string };

async function authorize(expectedTenantId: string) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Trebuie să fiți autentificat.');
  const { tenant } = await getActiveTenant();
  if (tenant.id !== expectedTenantId) throw new Error('Tenant mismatch.');
  await assertTenantMember(user.id, tenant.id);
  return { tenantId: tenant.id, userId: user.id };
}

async function transitionStatus(
  reservationId: string,
  expectedTenantId: string,
  newStatus: 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'NOSHOW' | 'COMPLETED',
  metadata: Record<string, unknown> = {},
): Promise<ResvActionResult> {
  try {
    const { tenantId, userId } = await authorize(expectedTenantId);
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = admin as any;

    const update: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'REJECTED' && metadata.reason) {
      update.rejection_reason = String(metadata.reason).slice(0, 500);
    }

    // Pull the row first so we have the customer's email + the
    // request's snapshot fields we need for the decision email.
    // Tenant ID is double-checked on the UPDATE below as defense-in-depth.
    const { data: resv } = await sb
      .from('reservations')
      .select(
        'customer_email, customer_first_name, party_size, requested_at, public_track_token',
      )
      .eq('id', reservationId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const { error } = await sb
      .from('reservations')
      .update(update)
      .eq('id', reservationId)
      .eq('tenant_id', tenantId);
    if (error) return { ok: false, error: error.message };

    // Best-effort customer email on a real status decision (not COMPLETED
    // / NOSHOW which are operational, not customer-facing). Skipped when
    // no customer_email was given, when Resend isn't configured, etc.
    if (
      resv &&
      (resv as { customer_email?: string | null }).customer_email &&
      (newStatus === 'CONFIRMED' || newStatus === 'REJECTED' || newStatus === 'CANCELLED')
    ) {
      const row = resv as {
        customer_email: string;
        customer_first_name: string;
        party_size: number;
        requested_at: string;
        public_track_token: string | null;
      };
      const { tenant } = await getActiveTenant();
      // Build the storefront /rezervari/track/[token] absolute URL. The
      // env var is the same one used to wire the cookie origin checks +
      // Stripe webhook receipts. Tenants on a custom domain can override
      // it; otherwise we fall back to the apex restaurant-web URL.
      const storefrontBase =
        process.env.NEXT_PUBLIC_RESTAURANT_WEB_URL ?? 'https://hir.ro';
      const trackUrl = row.public_track_token
        ? `${storefrontBase.replace(/\/$/, '')}/rezervari/track/${row.public_track_token}`
        : null;
      void notifyCustomerOfReservationDecision(newStatus as DecisionKind, {
        customerEmail: row.customer_email,
        customerFirstName: row.customer_first_name,
        tenantName: tenant.name,
        partySize: row.party_size,
        requestedAtIso: row.requested_at,
        rejectionReason:
          newStatus === 'REJECTED'
            ? (metadata.reason as string | undefined) ?? null
            : null,
        trackUrl,
      }).catch((err) =>
        console.error('[reservations] decision email failed', err),
      );
    }

    await logAudit({
      tenantId,
      actorUserId: userId,
      action:
        newStatus === 'CONFIRMED'
          ? 'reservation.confirmed'
          : newStatus === 'REJECTED'
            ? 'reservation.rejected'
            : newStatus === 'CANCELLED'
              ? 'reservation.cancelled'
              : newStatus === 'NOSHOW'
                ? 'reservation.noshow'
                : 'reservation.completed',
      entityType: 'reservation',
      entityId: reservationId,
      metadata,
    });

    revalidatePath('/dashboard/reservations');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function confirmReservation(
  raw: unknown,
): Promise<ResvActionResult> {
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Date invalide.' };
  return transitionStatus(parsed.data.reservationId, parsed.data.expectedTenantId, 'CONFIRMED');
}

export async function rejectReservation(
  raw: unknown,
): Promise<ResvActionResult> {
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Date invalide.' };
  return transitionStatus(parsed.data.reservationId, parsed.data.expectedTenantId, 'REJECTED', {
    reason: parsed.data.rejectionReason ?? '',
  });
}

export async function cancelReservation(
  raw: unknown,
): Promise<ResvActionResult> {
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Date invalide.' };
  return transitionStatus(parsed.data.reservationId, parsed.data.expectedTenantId, 'CANCELLED');
}

export async function markNoShow(raw: unknown): Promise<ResvActionResult> {
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Date invalide.' };
  return transitionStatus(parsed.data.reservationId, parsed.data.expectedTenantId, 'NOSHOW');
}

export async function markCompleted(raw: unknown): Promise<ResvActionResult> {
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Date invalide.' };
  return transitionStatus(parsed.data.reservationId, parsed.data.expectedTenantId, 'COMPLETED');
}

export async function updateReservationSettings(
  raw: unknown,
): Promise<ResvActionResult> {
  try {
    const parsed = settingsSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: 'Date invalide.' };
    const { tenantId, ...rest } = parsed.data;
    const { userId } = await authorize(tenantId);

    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = admin as any;
    const payload = {
      tenant_id: tenantId,
      ...rest,
      notify_email: rest.notify_email && rest.notify_email.length > 0 ? rest.notify_email : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from('reservation_settings').upsert(payload);
    if (error) return { ok: false, error: error.message };

    await logAudit({
      tenantId,
      actorUserId: userId,
      action: 'reservation.settings_updated',
      entityType: 'reservation_settings',
      entityId: tenantId,
      metadata: rest,
    });

    revalidatePath('/dashboard/reservations');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
