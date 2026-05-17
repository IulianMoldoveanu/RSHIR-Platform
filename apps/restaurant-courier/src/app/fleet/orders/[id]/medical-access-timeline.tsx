import { ShieldAlert } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';

// Sibling to <AuditTimeline />, rendered on pharma orders only. Reads
// medical_access_logs rows for this order and shows the audit trail
// the inspector or compliance officer will be looking for.
//
// Distinct from audit_log: that table captures actions; this captures
// VIEWS (who opened the order, when, from where). Pharma orders fan
// into both surfaces, and the dispatcher needs to see both in one
// place to debug a "who saw this customer's CNP last Thursday at 22:14"
// question without writing SQL.
//
// We deliberately label PURPOSE-not-ACTION here so a future a11y
// review (the GDPR Art.30 records-of-processing artifact this trail
// supports) can map purposes to legitimate processing bases.

const PURPOSE_LABEL_RO: Record<string, string> = {
  delivery: 'Vizualizare pentru livrare',
  dispatch: 'Vizualizare pentru dispecerizare',
  audit: 'Vizualizare pentru audit',
  support: 'Vizualizare pentru suport client',
  compliance_inspection: 'Vizualizare pentru control compliance',
};

type AccessRow = {
  id: number;
  actor_user_id: string;
  purpose: string;
  accessed_at: string;
  ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
};

type ProfileRow = { user_id: string; full_name: string | null };

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ro-RO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// Trim a user-agent into something readable in a row. The full UA is in
// metadata for an inspector to copy if needed; the row label uses a
// short form so the visual flow isn't dominated by a 200-char string.
function shortUa(ua: string | null): string | null {
  if (!ua) return null;
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  if (ua.includes('Macintosh')) return 'macOS';
  if (ua.includes('Windows')) return 'Windows';
  return null;
}

export async function MedicalAccessTimeline({ orderId }: { orderId: string }) {
  const admin = createAdminClient();

  const { data: rowsData } = await admin
    .from('medical_access_logs')
    .select('id, actor_user_id, purpose, accessed_at, ip, user_agent, metadata')
    .eq('entity_type', 'courier_order')
    .eq('entity_id', orderId)
    .order('accessed_at', { ascending: false })
    .limit(50);

  const rows = (rowsData ?? []) as AccessRow[];

  const actorIds = Array.from(new Set(rows.map((r) => r.actor_user_id)));
  const nameById = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profileData } = await admin
      .from('courier_profiles')
      .select('user_id, full_name')
      .in('user_id', actorIds);
    for (const row of (profileData ?? []) as ProfileRow[]) {
      if (row.full_name) nameById.set(row.user_id, row.full_name);
    }
  }

  return (
    <section className="rounded-2xl border border-amber-900/40 bg-amber-950/20 p-5">
      <div className="mb-3 flex items-center gap-2">
        <ShieldAlert className="h-3.5 w-3.5 text-amber-400" aria-hidden />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">
          Jurnal acces medical
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-amber-200/70">
          Niciun acces înregistrat la datele medicale ale acestei comenzi.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((row) => {
            const actorName = nameById.get(row.actor_user_id) ?? 'Sistem / dispecer';
            const purposeLabel = PURPOSE_LABEL_RO[row.purpose] ?? row.purpose;
            const ua = shortUa(row.user_agent);
            return (
              <li key={row.id} className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-amber-50">
                    <span className="font-semibold">{actorName}</span>{' '}
                    <span className="text-amber-200/80">— {purposeLabel}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-amber-200/60">
                    {formatTimestamp(row.accessed_at)}
                    {row.ip ? <> · IP {row.ip}</> : null}
                    {ua ? <> · {ua}</> : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <p className="mt-4 border-t border-amber-900/30 pt-3 text-[10px] leading-relaxed text-amber-200/50">
        Acest jurnal este menținut conform Legea 95 art. 213 și GDPR art. 30 — păstrare 5 ani. Toate accesările sunt log-ate automat; ștergerea înregistrărilor este blocată la nivel de bază de date.
      </p>
    </section>
  );
}
