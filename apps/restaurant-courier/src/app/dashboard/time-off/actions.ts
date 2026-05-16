'use server';

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { headers } from 'next/headers';

// Allowed reasons (enum-style) so free-text doesn't land in audit_log metadata
// as an injection vector. The courier picks from exactly these three strings.
const ALLOWED_REASONS = [
  'Concediu medical',
  'Vacanță',
  'Cauză personală',
] as const;
type TimeOffReason = (typeof ALLOWED_REASONS)[number];

function isAllowedReason(v: unknown): v is TimeOffReason {
  return typeof v === 'string' && (ALLOWED_REASONS as readonly string[]).includes(v);
}

function isDateString(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const d = new Date(v);
  return !isNaN(d.getTime());
}

export type TimeOffResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Submit a time-off / sick-day request.
 *
 * No `courier_time_off_requests` table exists in the current schema, so the
 * request is persisted as an audit_log row. The audit_log table is the agreed
 * fallback for courier-side events that lack a Supabase tenant context (same
 * pattern used for fleet-level events). The dispatcher/platform admin reads
 * these from the admin observability panel.
 *
 * The audit row is written directly via service-role client rather than
 * through the `logAudit` helper because that helper intentionally skips rows
 * where no tenant ID can be derived — time-off requests have no tenant scope
 * and must still be persisted.
 */
export async function requestTimeOffAction(
  formData: FormData,
): Promise<TimeOffResult> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const reason = formData.get('reason');
  const startDate = formData.get('start_date');
  const endDate = formData.get('end_date');
  const note = formData.get('note');

  if (!isAllowedReason(reason)) {
    return { ok: false, error: 'Motiv invalid.' };
  }
  if (!isDateString(startDate)) {
    return { ok: false, error: 'Data de început este invalidă.' };
  }
  if (!isDateString(endDate)) {
    return { ok: false, error: 'Data de sfârșit este invalidă.' };
  }
  if (new Date(endDate as string) < new Date(startDate as string)) {
    return { ok: false, error: 'Data de sfârșit trebuie să fie după data de început.' };
  }

  const trimmedNote = typeof note === 'string' ? note.trim().slice(0, 300) : '';

  // Capture request context for forensic use (mirrors logAudit pattern).
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null;
    const rawUa = h.get('user-agent');
    userAgent = rawUa ? rawUa.slice(0, 200) : null;
  } catch {
    // Not available in test/cron contexts — safe to proceed without.
  }

  const admin = createAdminClient();

  // Write directly to audit_log (bypassing the logAudit helper's tenant-derive
  // guard, which would silently skip this row). tenant_id is nullable in the
  // schema; NULL here is intentional — the row is courier-scoped, not tenant-scoped.
  const sb = admin as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };

  const { error } = await sb.from('audit_log').insert({
    tenant_id: null,
    actor_user_id: user.id,
    action: 'courier.time_off_requested',
    entity_type: 'courier_profile',
    entity_id: user.id,
    metadata: {
      reason,
      start_date: startDate,
      end_date: endDate,
      ...(trimmedNote ? { note: trimmedNote } : {}),
      ...(ip ? { ip } : {}),
      ...(userAgent ? { user_agent: userAgent } : {}),
    },
  });

  if (error) {
    console.error('[time-off] audit_log insert failed', error.message);
    return { ok: false, error: 'A apărut o eroare. Încearcă din nou.' };
  }

  return { ok: true };
}
