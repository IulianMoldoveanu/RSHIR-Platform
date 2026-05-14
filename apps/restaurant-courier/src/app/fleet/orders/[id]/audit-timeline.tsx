import { Activity } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';

// Server component that loads the audit_log entries for a courier_order
// and renders a compact timeline for the dispatcher. Per the F2
// compliance plan ("UI Audit livrare cu cine, când, ce, IP, device,
// geo"), this surfaces actor + action + relevant metadata derived
// from the JSONB column.
//
// Status transitions (CREATED → ACCEPTED → DELIVERED) are NOT in
// audit_log — they live on courier_orders.status + .updated_at and
// already render in the progress bar above this section. This timeline
// covers the events that the lifecycle bar can't: cash collected,
// geofence warnings, manual reassignments, cancellations, pharma
// callbacks, etc.

const ACTION_LABEL_RO: Record<string, string> = {
  'fleet.order_assigned': 'Asignată manual de dispecer',
  'fleet.order_unassigned': 'Dezasignată de dispecer',
  'fleet.order_auto_assigned': 'Auto-asignată',
  'fleet.bulk_auto_assigned': 'Auto-asignată (lot)',
  'delivery.geofence_warning': 'Avertizare geofence — curier departe de adresa de livrare',
  'order.cash_collected': 'Cash încasat de curier',
  'order.force_cancelled_by_courier': 'Anulată la final de tură de curier',
  'pharma.callback_sent': 'Notificare farmacie trimisă',
};

type AuditRow = {
  id: string;
  actor_user_id: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type ProfileRow = { user_id: string; full_name: string | null };

function metadataSummary(action: string, metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  if (action === 'delivery.geofence_warning') {
    const dist = Number(metadata.distance_m);
    if (Number.isFinite(dist)) return `${Math.round(dist)} m de la adresa de livrare`;
  }
  if (action === 'order.cash_collected') {
    const amt = Number(metadata.amount_ron);
    if (Number.isFinite(amt)) return `${amt.toFixed(2)} RON`;
  }
  if (action === 'order.force_cancelled_by_courier') {
    const reason = typeof metadata.reason === 'string' ? metadata.reason : null;
    if (reason) return `Motiv: ${reason}`;
  }
  return null;
}

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

export async function AuditTimeline({ orderId }: { orderId: string }) {
  const admin = createAdminClient();

  const { data: rowsData } = await admin
    .from('audit_log')
    .select('id, actor_user_id, action, metadata, created_at')
    .eq('entity_type', 'courier_order')
    .eq('entity_id', orderId)
    .order('created_at', { ascending: true })
    .limit(50);

  const rows = (rowsData ?? []) as AuditRow[];

  // Batch-resolve actor names from courier_profiles. Dispatchers don't
  // have courier_profiles rows but they hit the same actor_user_id; for
  // unknowns we fall back to a neutral "Sistem / dispecer" label rather
  // than echoing the UUID.
  const actorIds = Array.from(
    new Set(rows.map((r) => r.actor_user_id).filter((id): id is string => !!id)),
  );
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
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Activity className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Jurnal de audit
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500">
          Nicio acțiune înregistrată pe această comandă în plus față de tranzițiile de stare de mai sus.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((row) => {
            const actorName = row.actor_user_id
              ? nameById.get(row.actor_user_id) ?? 'Sistem / dispecer'
              : 'Sistem';
            const actionLabel = ACTION_LABEL_RO[row.action] ?? row.action;
            const summary = metadataSummary(row.action, row.metadata);
            return (
              <li key={row.id} className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-100">
                    <span className="font-semibold">{actorName}</span>{' '}
                    <span className="text-zinc-400">— {actionLabel}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {formatTimestamp(row.created_at)}
                    {summary ? <> · {summary}</> : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
