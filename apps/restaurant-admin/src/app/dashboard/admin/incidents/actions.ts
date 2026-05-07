'use server';

// Lane STATUS-INCIDENTS-ADMIN — operator surface for the public /status page.
//
// All actions here are platform-admin only (HIR_PLATFORM_ADMIN_EMAILS allow
// list, same gate as /dashboard/admin/onboard + /dashboard/admin/system).
// Writes go through the service-role admin client because public_incidents
// has RLS with service_role-only INSERT/UPDATE policies.
//
// No per-tenant audit_log entries: incidents are platform-wide and the
// existing audit_log requires a non-null tenant_id. Created_by + resolved_by
// columns on the incident itself + the append-only status log carry the
// authorship signal.

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const VALID_STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'] as const;
const VALID_SEVERITIES = ['minor', 'major', 'critical'] as const;
type IncidentStatus = (typeof VALID_STATUSES)[number];
type IncidentSeverity = (typeof VALID_SEVERITIES)[number];

const VALID_SERVICES = ['restaurant-web', 'restaurant-admin', 'restaurant-courier'];

export type IncidentActionResult =
  | { ok: true; incidentId: string }
  | { ok: false; error: string; code?: 'forbidden' | 'invalid' | 'db_failed' };

async function getPlatformAdmin(): Promise<
  | { ok: true; userId: string; email: string }
  | { ok: false; error: string; code: 'forbidden' }
> {
  const supa = createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user?.email) return { ok: false, error: 'Nu sunteți autentificat.', code: 'forbidden' };
  const allow = (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allow.includes(user.email.toLowerCase())) {
    return { ok: false, error: 'Acces interzis.', code: 'forbidden' };
  }
  return { ok: true, userId: user.id, email: user.email };
}

// Lightweight admin client cast — public_incidents + public_incident_status_log
// aren't yet in the generated supabase types until gen-types.mjs runs after merge.
// Use distinct types per code path to avoid intersecting the thenable insert
// (no .select()) with the chained insert (.select().single()).
type InsertReturning = {
  from: (t: string) => {
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => {
        single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
      };
    };
  };
};
type InsertVoid = {
  from: (t: string) => {
    insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
};
type UpdateClient = {
  from: (t: string) => {
    update: (row: Record<string, unknown>) => {
      eq: (k: string, v: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

function sanitizeServices(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s) => VALID_SERVICES.includes(s));
}

function trimOrNull(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  return t.slice(0, max);
}

export type CreateIncidentInput = {
  title: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  affectedServices: string[];
  description?: string;
};

export async function createIncident(input: CreateIncidentInput): Promise<IncidentActionResult> {
  const auth = await getPlatformAdmin();
  if (!auth.ok) return auth;

  const title = (input.title ?? '').trim();
  if (title.length < 3 || title.length > 200) {
    return { ok: false, error: 'Titlul trebuie să aibă între 3 și 200 de caractere.', code: 'invalid' };
  }
  if (!VALID_STATUSES.includes(input.status)) {
    return { ok: false, error: 'Status invalid.', code: 'invalid' };
  }
  if (!VALID_SEVERITIES.includes(input.severity)) {
    return { ok: false, error: 'Severitate invalidă.', code: 'invalid' };
  }
  const services = sanitizeServices(input.affectedServices);
  const description = trimOrNull(input.description, 4000);

  const adminRaw = createAdminClient();
  const adminInsRet = adminRaw as unknown as InsertReturning;
  const adminInsVoid = adminRaw as unknown as InsertVoid;

  const ins = await adminInsRet
    .from('public_incidents')
    .insert({
      title,
      status: input.status,
      severity: input.severity,
      affected_services: services,
      description,
      created_by: auth.userId,
      resolved_at: input.status === 'resolved' ? new Date().toISOString() : null,
      resolved_by: input.status === 'resolved' ? auth.userId : null,
    })
    .select('id')
    .single();

  if (ins.error || !ins.data) {
    console.error('[admin/incidents] insert failed', ins.error?.message);
    return { ok: false, error: ins.error?.message ?? 'Eroare la inserare.', code: 'db_failed' };
  }
  const incidentId = ins.data.id;

  // Seed initial status log row so the public timeline always shows the
  // first state, not just transitions away from it.
  const logIns = await adminInsVoid.from('public_incident_status_log').insert({
    incident_id: incidentId,
    status: input.status,
    changed_by: auth.userId,
    note: null,
  });
  if (logIns.error) {
    console.warn('[admin/incidents] status_log seed failed (non-fatal)', logIns.error.message);
  }

  revalidatePath('/dashboard/admin/incidents');
  // Public status page is ISR (revalidate=60); explicit invalidation makes the
  // new incident visible on first refresh instead of after the next 60s tick.
  revalidatePath('/status');

  return { ok: true, incidentId };
}

export type UpdateIncidentStatusInput = {
  incidentId: string;
  status: IncidentStatus;
  note?: string;
};

export async function updateIncidentStatus(
  input: UpdateIncidentStatusInput,
): Promise<IncidentActionResult> {
  const auth = await getPlatformAdmin();
  if (!auth.ok) return auth;

  const incidentId = (input.incidentId ?? '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(incidentId)) {
    return { ok: false, error: 'ID incident invalid.', code: 'invalid' };
  }
  if (!VALID_STATUSES.includes(input.status)) {
    return { ok: false, error: 'Status invalid.', code: 'invalid' };
  }
  const note = trimOrNull(input.note, 1000);

  const adminRaw = createAdminClient();
  const adminUpd = adminRaw as unknown as UpdateClient;
  const adminInsVoid = adminRaw as unknown as InsertVoid;

  const patch: Record<string, unknown> = { status: input.status };
  if (input.status === 'resolved') {
    patch.resolved_at = new Date().toISOString();
    patch.resolved_by = auth.userId;
  } else {
    // Re-opening from resolved → clear resolution columns. Idempotent if the
    // status was already non-resolved (columns just get set to their current
    // null values).
    patch.resolved_at = null;
    patch.resolved_by = null;
  }

  const upd = await adminUpd
    .from('public_incidents')
    .update(patch)
    .eq('id', incidentId);

  if (upd.error) {
    console.error('[admin/incidents] update failed', upd.error.message);
    return { ok: false, error: upd.error.message, code: 'db_failed' };
  }

  const logIns = await adminInsVoid.from('public_incident_status_log').insert({
    incident_id: incidentId,
    status: input.status,
    note,
    changed_by: auth.userId,
  });
  if (logIns.error) {
    console.warn('[admin/incidents] status_log insert failed (non-fatal)', logIns.error.message);
  }

  revalidatePath('/dashboard/admin/incidents');
  revalidatePath('/status');

  return { ok: true, incidentId };
}

export type UpdateIncidentMetadataInput = {
  incidentId: string;
  title?: string;
  severity?: IncidentSeverity;
  affectedServices?: string[];
  description?: string;
  postmortemUrl?: string;
};

export async function updateIncidentMetadata(
  input: UpdateIncidentMetadataInput,
): Promise<IncidentActionResult> {
  const auth = await getPlatformAdmin();
  if (!auth.ok) return auth;

  const incidentId = (input.incidentId ?? '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(incidentId)) {
    return { ok: false, error: 'ID incident invalid.', code: 'invalid' };
  }

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const t = (input.title ?? '').trim();
    if (t.length < 3 || t.length > 200) {
      return { ok: false, error: 'Titlul trebuie să aibă între 3 și 200 de caractere.', code: 'invalid' };
    }
    patch.title = t;
  }
  if (input.severity !== undefined) {
    if (!VALID_SEVERITIES.includes(input.severity)) {
      return { ok: false, error: 'Severitate invalidă.', code: 'invalid' };
    }
    patch.severity = input.severity;
  }
  if (input.affectedServices !== undefined) {
    patch.affected_services = sanitizeServices(input.affectedServices);
  }
  if (input.description !== undefined) {
    patch.description = trimOrNull(input.description, 4000);
  }
  if (input.postmortemUrl !== undefined) {
    const url = trimOrNull(input.postmortemUrl, 500);
    if (url && !/^https?:\/\//i.test(url)) {
      return { ok: false, error: 'URL postmortem invalid (necesită http/https).', code: 'invalid' };
    }
    patch.postmortem_url = url;
  }

  if (Object.keys(patch).length === 0) {
    // Nothing to do is not an error — keeps caller idempotent.
    return { ok: true, incidentId };
  }

  const adminUpd = createAdminClient() as unknown as UpdateClient;
  const upd = await adminUpd
    .from('public_incidents')
    .update(patch)
    .eq('id', incidentId);

  if (upd.error) {
    console.error('[admin/incidents] metadata update failed', upd.error.message);
    return { ok: false, error: upd.error.message, code: 'db_failed' };
  }

  // (auth.userId is already recorded against status transitions in the log
  // table; metadata-only edits don't generate a log row by design — kept
  // intentionally to avoid the "every save inflates the timeline" pattern.)
  void auth;

  revalidatePath('/dashboard/admin/incidents');
  revalidatePath('/status');

  return { ok: true, incidentId };
}
