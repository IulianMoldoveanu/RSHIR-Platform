import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Apps probed by supabase/functions/health-monitor (must stay in sync with
// the ENDPOINTS array there). Used both for the per-service tile grid and
// the 90-day uptime computation.
export const MONITORED_APPS = [
  { id: 'restaurant-web', label: 'Storefront' },
  { id: 'restaurant-admin', label: 'Admin' },
  { id: 'restaurant-courier', label: 'Curier' },
] as const;

export type AppId = (typeof MONITORED_APPS)[number]['id'];

export type OverallStatus = 'operational' | 'degraded' | 'outage' | 'unknown';

export type ServiceStatus = {
  app: AppId;
  label: string;
  state: 'up' | 'down' | 'unknown';
  lastCheckedAt: string | null;
  failedSince: string | null;
  latencyMs: number | null;
};

export type DailyUptime = {
  // ISO date (YYYY-MM-DD) in UTC.
  day: string;
  total: number;
  failed: number;
  // 0..1 — null when no pings recorded for that day.
  uptime: number | null;
};

export type IncidentTimelineEntry = {
  status: string;
  note: string | null;
  changedAt: string;
};

export type Incident = {
  id: string;
  title: string;
  status: string;
  severity: string;
  affectedServices: string[];
  description: string | null;
  postmortemUrl: string | null;
  startedAt: string;
  resolvedAt: string | null;
  timeline: IncidentTimelineEntry[];
};

export type StatusSnapshot = {
  overall: OverallStatus;
  services: ServiceStatus[];
  uptime: Record<AppId, DailyUptime[]>;
  incidents: Incident[];
  generatedAt: string;
};

const DAY_MS = 86_400_000;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function loadStatusSnapshot(): Promise<StatusSnapshot> {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const since90 = new Date(now.getTime() - 90 * DAY_MS).toISOString();
  const since30 = new Date(now.getTime() - 30 * DAY_MS).toISOString();

  // 1. Per-service current state from health_monitor_state. Cold-start safe:
  //    if a row is missing we mark the service "unknown" rather than fabricating
  //    a green badge.
  const stateP = supabase
    .from('health_monitor_state' as never)
    .select('app, last_ok, failed_since, last_checked_at')
    .returns<
      { app: string; last_ok: boolean; failed_since: string | null; last_checked_at: string }[]
    >();

  // 2. Last 5 pings overall (across all apps) drives the overall badge —
  //    "operational" only when all 5 are green; "degraded" when 1-2 failed;
  //    "outage" when ≥3 failed.
  const recentP = supabase
    .from('health_check_pings' as never)
    .select('app, ok, latency_ms, checked_at')
    .order('checked_at', { ascending: false })
    .limit(5)
    .returns<{ app: string; ok: boolean; latency_ms: number | null; checked_at: string }[]>();

  // 3. 90-day pings, aggregated client-side per (app, day).
  const pingsP = supabase
    .from('health_check_pings' as never)
    .select('app, ok, checked_at')
    .gte('checked_at', since90)
    .order('checked_at', { ascending: true })
    .returns<{ app: string; ok: boolean; checked_at: string }[]>();

  // 4. Last-30-day public incidents.
  const incidentsP = supabase
    .from('public_incidents' as never)
    .select(
      'id, title, status, severity, affected_services, description, postmortem_url, started_at, resolved_at',
    )
    .gte('started_at', since30)
    .order('started_at', { ascending: false })
    .returns<
      {
        id: string;
        title: string;
        status: string;
        severity: string;
        affected_services: string[] | null;
        description: string | null;
        postmortem_url: string | null;
        started_at: string;
        resolved_at: string | null;
      }[]
    >();

  const [stateR, recentR, pingsR, incidentsR] = await Promise.all([
    stateP,
    recentP,
    pingsP,
    incidentsP,
  ]);

  // Fetch the status-log timeline for the visible incidents in a single
  // round-trip. Lane STATUS-INCIDENTS-ADMIN seeds an entry on create + every
  // status change so the public page can show a "investigare → identificat
  // → rezolvat" mini-timeline. Pre-existing incidents (created before the
  // log table existed) come back with an empty timeline — the consumer
  // gracefully falls back to just the start/end timestamps.
  const incidentRows = incidentsR.data ?? [];
  const incidentIds = incidentRows.map((r) => r.id);
  let timelineByIncident: Record<string, IncidentTimelineEntry[]> = {};
  if (incidentIds.length > 0) {
    const logsR = await supabase
      .from('public_incident_status_log' as never)
      .select('incident_id, status, note, changed_at')
      .in('incident_id', incidentIds)
      .order('changed_at', { ascending: true })
      .returns<
        { incident_id: string; status: string; note: string | null; changed_at: string }[]
      >();
    timelineByIncident = (logsR.data ?? []).reduce<Record<string, IncidentTimelineEntry[]>>(
      (acc, row) => {
        (acc[row.incident_id] ??= []).push({
          status: row.status,
          note: row.note,
          changedAt: row.changed_at,
        });
        return acc;
      },
      {},
    );
  }

  const stateRows = stateR.data ?? [];
  const stateByApp = new Map(stateRows.map((r) => [r.app, r]));

  // Build last-known latency per app from the last-5 pings table (cheaper than
  // a per-app order/limit fan-out).
  const recent = recentR.data ?? [];
  const latencyByApp = new Map<string, number | null>();
  for (const p of recent) {
    if (!latencyByApp.has(p.app)) latencyByApp.set(p.app, p.latency_ms);
  }

  const services: ServiceStatus[] = MONITORED_APPS.map((m) => {
    const s = stateByApp.get(m.id);
    if (!s) {
      return {
        app: m.id,
        label: m.label,
        state: 'unknown',
        lastCheckedAt: null,
        failedSince: null,
        latencyMs: null,
      };
    }
    return {
      app: m.id,
      label: m.label,
      state: s.last_ok ? 'up' : 'down',
      lastCheckedAt: s.last_checked_at,
      failedSince: s.failed_since,
      latencyMs: latencyByApp.get(m.id) ?? null,
    };
  });

  // Overall badge logic: derive from the recent 5 pings rather than the
  // per-service state, so a single transient blip doesn't wipe the green badge.
  let overall: OverallStatus = 'unknown';
  if (recent.length === 0 && stateRows.length === 0) {
    overall = 'unknown';
  } else if (recent.length === 0) {
    // Have state rows but no recorded pings yet (fresh deploy of the history
    // table). Fall back to per-service state.
    const anyDown = services.some((s) => s.state === 'down');
    overall = anyDown ? 'outage' : 'operational';
  } else {
    const failed = recent.filter((p) => !p.ok).length;
    if (failed === 0) overall = 'operational';
    else if (failed >= 3) overall = 'outage';
    else overall = 'degraded';
  }

  // 90-day per-app daily uptime aggregation.
  const pings = pingsR.data ?? [];
  const uptime = {} as Record<AppId, DailyUptime[]>;
  for (const m of MONITORED_APPS) {
    uptime[m.id] = build90DayBuckets(now);
  }
  for (const p of pings) {
    const day = isoDay(new Date(p.checked_at));
    const buckets = uptime[p.app as AppId];
    if (!buckets) continue;
    const bucket = buckets.find((b) => b.day === day);
    if (!bucket) continue;
    bucket.total += 1;
    if (!p.ok) bucket.failed += 1;
  }
  for (const m of MONITORED_APPS) {
    for (const b of uptime[m.id]) {
      b.uptime = b.total === 0 ? null : (b.total - b.failed) / b.total;
    }
  }

  const incidents: Incident[] = incidentRows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    severity: r.severity,
    affectedServices: r.affected_services ?? [],
    description: r.description,
    postmortemUrl: r.postmortem_url,
    startedAt: r.started_at,
    resolvedAt: r.resolved_at,
    timeline: timelineByIncident[r.id] ?? [],
  }));

  return {
    overall,
    services,
    uptime,
    incidents,
    generatedAt: now.toISOString(),
  };
}

function build90DayBuckets(now: Date): DailyUptime[] {
  const out: DailyUptime[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY_MS);
    out.push({ day: isoDay(d), total: 0, failed: 0, uptime: null });
  }
  return out;
}
