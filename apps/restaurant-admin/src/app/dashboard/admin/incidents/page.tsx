// Lane STATUS-INCIDENTS-ADMIN — operator surface for the public /status page.
//
// Lists active + recent incidents and exposes a "Declară incident nou" form.
// Per-incident actions: change status (investigating → identified → monitoring
// → resolved), edit metadata, attach postmortem URL.
//
// Read goes via service-role admin client because public_incidents has RLS
// with anon SELECT only (no per-tenant scope). All writes go through the
// server actions in ./actions.ts which gate on HIR_PLATFORM_ADMIN_EMAILS.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { IncidentsClient } from './client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type IncidentRow = {
  id: string;
  title: string;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  severity: 'minor' | 'major' | 'critical';
  affected_services: string[] | null;
  description: string | null;
  postmortem_url: string | null;
  started_at: string;
  resolved_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  resolved_by: string | null;
};

export type IncidentLogRow = {
  id: string;
  incident_id: string;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  note: string | null;
  changed_by: string | null;
  changed_at: string;
};

const PAGE_LIMIT = 30;

export default async function AdminIncidentsPage() {
  const supa = createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user?.email) redirect('/login?next=/dashboard/admin/incidents');

  const allow = (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allow.includes(user.email.toLowerCase())) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Acces interzis: această pagină este rezervată administratorilor HIR.
      </div>
    );
  }

  const admin = createAdminClient() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        order: (
          c: string,
          o: { ascending: boolean },
        ) => {
          limit: (n: number) => Promise<{ data: unknown; error: { message: string } | null }>;
          in?: (
            c: string,
            v: string[],
          ) => {
            order: (
              c: string,
              o: { ascending: boolean },
            ) => Promise<{ data: unknown; error: { message: string } | null }>;
          };
        };
      };
    };
  };

  const incidentsRes = await admin
    .from('public_incidents')
    .select(
      'id, title, status, severity, affected_services, description, postmortem_url, started_at, resolved_at, updated_at, created_by, resolved_by',
    )
    .order('started_at', { ascending: false })
    .limit(PAGE_LIMIT);

  const incidents: IncidentRow[] = (incidentsRes.data as IncidentRow[] | null) ?? [];

  // Fetch the status log for the visible incidents in one round-trip rather
  // than N+1. With PAGE_LIMIT=30 incidents and ≤4 transitions each, this is
  // ~120 rows max — well within a single .in() filter.
  let logsByIncident: Record<string, IncidentLogRow[]> = {};
  if (incidents.length > 0) {
    const ids = incidents.map((i) => i.id);
    const logsClient = admin as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          in: (
            c: string,
            v: string[],
          ) => {
            order: (
              c: string,
              o: { ascending: boolean },
            ) => Promise<{ data: IncidentLogRow[] | null; error: { message: string } | null }>;
          };
        };
      };
    };
    const logsRes = await logsClient
      .from('public_incident_status_log')
      .select('id, incident_id, status, note, changed_by, changed_at')
      .in('incident_id', ids)
      .order('changed_at', { ascending: true });
    const allLogs = logsRes.data ?? [];
    logsByIncident = allLogs.reduce<Record<string, IncidentLogRow[]>>((acc, row) => {
      (acc[row.incident_id] ??= []).push(row);
      return acc;
    }, {});
  }

  const active = incidents.filter((i) => i.status !== 'resolved');
  const recent = incidents.filter((i) => i.status === 'resolved');

  return (
    <IncidentsClient
      active={active}
      recent={recent}
      logsByIncident={logsByIncident}
    />
  );
}
