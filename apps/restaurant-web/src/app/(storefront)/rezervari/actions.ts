'use server';

import { z } from 'zod';
import { resolveTenantFromHost } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const requestSchema = z.object({
  first_name: z.string().min(1).max(100),
  phone: z.string().min(5).max(40),
  email: z.string().email().or(z.literal('')).optional(),
  party_size: z.number().int().min(1).max(100),
  // ISO 8601 timestamp e.g. "2026-05-01T19:00:00+03:00"
  requested_at: z.string().datetime({ offset: true }),
  notes: z.string().max(500).optional(),
});

export type ReservationRequestResult =
  | { ok: true; reservationId: string; trackToken: string }
  | { ok: false; error: string };

export async function requestReservation(
  raw: unknown,
): Promise<ReservationRequestResult> {
  // Same-origin check (defense-in-depth — server actions are POST-only).
  // This relies on the standard wrapper used elsewhere in the storefront.
  // We intentionally don't pass a NextRequest here (server action) — the
  // origin check would be done at the route layer if this becomes a route.

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'Date invalide. Verifică câmpurile.' };
  }
  const data = parsed.data;

  const { tenant } = await resolveTenantFromHost();
  if (!tenant) {
    return { ok: false, error: 'Restaurant negăsit.' };
  }

  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { data: rpcResult, error } = await sb.rpc('fn_reservation_request', {
    p_tenant_id: tenant.id,
    p_first_name: data.first_name,
    p_phone: data.phone,
    p_email: data.email && data.email.length > 0 ? data.email : null,
    p_party_size: data.party_size,
    p_requested_at: data.requested_at,
    p_notes: data.notes && data.notes.length > 0 ? data.notes : null,
  });

  if (error) {
    console.error('[storefront/rezervari] RPC failed', error.message);
    return { ok: false, error: 'A apărut o eroare. Încercați din nou în câteva minute.' };
  }

  // RPC returns a one-row table — Supabase returns it as an array.
  const row = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
  if (!row) {
    return { ok: false, error: 'Nu am putut salva rezervarea.' };
  }

  if (row.status === 'REJECTED') {
    return { ok: false, error: row.message || 'Rezervarea nu a putut fi acceptată.' };
  }

  return {
    ok: true,
    reservationId: String(row.reservation_id),
    trackToken: String(row.public_track_token),
  };
}
