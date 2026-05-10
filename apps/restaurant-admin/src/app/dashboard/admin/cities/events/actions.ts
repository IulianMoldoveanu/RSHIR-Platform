'use server';

// Lane EVENTS-SIGNAL-INGESTION — admin server actions for the manual feed
// at /dashboard/admin/cities/events.
//
// Platform-admin only (HIR_PLATFORM_ADMIN_EMAILS allow list, same gate as
// /dashboard/admin/incidents). All writes go through the service-role
// admin client because city_events RLS is service_role-only for INSERT.
//
// Three actions:
//   - createManualEvent   — single row
//   - importManualEventsCsv — bulk paste CSV (small, <1k rows; bigger should
//                            use the Edge Function path)
//   - deleteEvent         — remove by id (any source)

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const VALID_TYPES = [
  'concert',
  'festival',
  'sport',
  'conference',
  'theatre',
  'exhibition',
  'holiday',
  'other',
] as const;
type EventType = (typeof VALID_TYPES)[number];

export type EventActionResult =
  | { ok: true; eventId?: string; inserted?: number; skipped?: number }
  | { ok: false; error: string; code?: 'forbidden' | 'invalid' | 'db_failed' };

async function getPlatformAdmin(): Promise<
  | { ok: true; userId: string; email: string }
  | { ok: false; error: string; code: 'forbidden' }
> {
  const supa = await createServerClient();
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

function trimOrNull(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function parseFloatOrNull(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseIntOrNull(raw: unknown): number | null {
  const n = parseFloatOrNull(raw);
  if (n === null) return null;
  return Math.trunc(n);
}

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
}

function parseIso(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type AdminInsertReturning = {
  from: (t: string) => {
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => {
        single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
      };
    };
  };
};
type AdminBulkInsert = {
  from: (t: string) => {
    upsert: (
      rows: Record<string, unknown>[],
      opts: { onConflict: string; count?: 'exact' },
    ) => Promise<{ count: number | null; error: { message: string } | null }>;
  };
};
type AdminDelete = {
  from: (t: string) => {
    delete: () => {
      eq: (k: string, v: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

export type CreateEventInput = {
  cityId: string;
  eventName: string;
  eventType: EventType;
  startAt: string;
  endAt?: string;
  venueName?: string;
  venueLat?: string;
  venueLon?: string;
  expectedAttendance?: string;
  url?: string;
};

export async function createManualEvent(input: CreateEventInput): Promise<EventActionResult> {
  const auth = await getPlatformAdmin();
  if (!auth.ok) return auth;

  if (!isUuid(input.cityId)) {
    return { ok: false, error: 'Oraș invalid.', code: 'invalid' };
  }
  const eventName = (input.eventName ?? '').trim();
  if (eventName.length < 3 || eventName.length > 500) {
    return { ok: false, error: 'Numele evenimentului trebuie să aibă între 3 și 500 de caractere.', code: 'invalid' };
  }
  if (!VALID_TYPES.includes(input.eventType)) {
    return { ok: false, error: 'Tip eveniment invalid.', code: 'invalid' };
  }
  const startAt = parseIso(input.startAt);
  if (!startAt) {
    return { ok: false, error: 'Dată de început invalidă.', code: 'invalid' };
  }
  const endAt = input.endAt ? parseIso(input.endAt) : null;
  if (input.endAt && !endAt) {
    return { ok: false, error: 'Dată de sfârșit invalidă.', code: 'invalid' };
  }
  if (endAt && new Date(endAt).getTime() < new Date(startAt).getTime()) {
    return { ok: false, error: 'Data de sfârșit trebuie să fie după data de început.', code: 'invalid' };
  }

  const url = trimOrNull(input.url, 500);
  if (url && !/^https?:\/\//i.test(url)) {
    return { ok: false, error: 'URL invalid (necesită http/https).', code: 'invalid' };
  }

  const row = {
    city_id: input.cityId,
    event_name: eventName,
    event_type: input.eventType,
    start_at: startAt,
    end_at: endAt,
    venue_name: trimOrNull(input.venueName, 250),
    venue_lat: parseFloatOrNull(input.venueLat),
    venue_lon: parseFloatOrNull(input.venueLon),
    expected_attendance: parseIntOrNull(input.expectedAttendance),
    url,
    source: 'manual',
    source_event_id: randomUUID(),
    raw_payload: { entered_by: auth.userId },
  };

  const adminRaw = createAdminClient();
  const adminIns = adminRaw as unknown as AdminInsertReturning;

  const ins = await adminIns
    .from('city_events')
    .insert(row)
    .select('id')
    .single();
  if (ins.error || !ins.data) {
    console.error('[admin/cities/events] insert failed', ins.error?.message);
    return { ok: false, error: ins.error?.message ?? 'Eroare la inserare.', code: 'db_failed' };
  }

  revalidatePath('/dashboard/admin/cities/events');
  return { ok: true, eventId: ins.data.id };
}

export type ImportCsvInput = {
  cityId: string;
  csv: string;
};

// CSV columns (header required, semicolon delimiter — same as our SmartBill /
// SAGA register exports): event_name;event_type;start_at;end_at;venue_name;
// expected_attendance;url
//
// Rows that fail validation are skipped (counted) but never block the rest.
export async function importManualEventsCsv(input: ImportCsvInput): Promise<EventActionResult> {
  const auth = await getPlatformAdmin();
  if (!auth.ok) return auth;

  if (!isUuid(input.cityId)) {
    return { ok: false, error: 'Oraș invalid.', code: 'invalid' };
  }
  const csv = (input.csv ?? '').trim();
  if (!csv) return { ok: false, error: 'CSV gol.', code: 'invalid' };

  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { ok: false, error: 'CSV trebuie să conțină antet + minim un rând.', code: 'invalid' };
  }
  const header = lines[0].split(';').map((c) => c.trim().toLowerCase());
  const required = ['event_name', 'event_type', 'start_at'];
  for (const r of required) {
    if (!header.includes(r)) {
      return { ok: false, error: `Lipsește coloana obligatorie: ${r}`, code: 'invalid' };
    }
  }
  const idx = (col: string) => header.indexOf(col);

  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(';').map((c) => c.trim());
    const name = cells[idx('event_name')] ?? '';
    const type = (cells[idx('event_type')] ?? 'other') as EventType;
    const start = parseIso(cells[idx('start_at')] ?? '');
    if (!name || name.length < 3 || !VALID_TYPES.includes(type) || !start) {
      skipped++;
      continue;
    }
    const endAt = idx('end_at') >= 0 ? parseIso(cells[idx('end_at')] ?? '') : null;
    const venueName = idx('venue_name') >= 0 ? trimOrNull(cells[idx('venue_name')], 250) : null;
    const expectedAttendance = idx('expected_attendance') >= 0 ? parseIntOrNull(cells[idx('expected_attendance')]) : null;
    const urlRaw = idx('url') >= 0 ? trimOrNull(cells[idx('url')], 500) : null;
    const url = urlRaw && /^https?:\/\//i.test(urlRaw) ? urlRaw : null;

    rows.push({
      city_id: input.cityId,
      event_name: name.slice(0, 500),
      event_type: type,
      start_at: start,
      end_at: endAt,
      venue_name: venueName,
      expected_attendance: expectedAttendance,
      url,
      source: 'manual',
      source_event_id: randomUUID(),
      raw_payload: { entered_by: auth.userId, csv_row: i },
    });
  }

  if (rows.length === 0) {
    return { ok: false, error: `Nicio linie validă (${skipped} ignorate).`, code: 'invalid' };
  }

  const adminBulk = createAdminClient() as unknown as AdminBulkInsert;
  const ins = await adminBulk
    .from('city_events')
    .upsert(rows, { onConflict: 'source,source_event_id', count: 'exact' });
  if (ins.error) {
    console.error('[admin/cities/events] csv import failed', ins.error.message);
    return { ok: false, error: ins.error.message, code: 'db_failed' };
  }

  revalidatePath('/dashboard/admin/cities/events');
  return { ok: true, inserted: ins.count ?? rows.length, skipped };
}

export async function deleteEvent(eventId: string): Promise<EventActionResult> {
  const auth = await getPlatformAdmin();
  if (!auth.ok) return auth;
  // Authorship is captured by the platform-admin gate above; row-level
  // attribution lives in raw_payload.entered_by for manual events.
  void auth;

  if (!isUuid(eventId)) {
    return { ok: false, error: 'ID eveniment invalid.', code: 'invalid' };
  }

  const adminDel = createAdminClient() as unknown as AdminDelete;
  const del = await adminDel.from('city_events').delete().eq('id', eventId);
  if (del.error) {
    console.error('[admin/cities/events] delete failed', del.error.message);
    return { ok: false, error: del.error.message, code: 'db_failed' };
  }

  revalidatePath('/dashboard/admin/cities/events');
  return { ok: true };
}
