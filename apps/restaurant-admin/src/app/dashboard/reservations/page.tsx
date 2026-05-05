import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';
import { ReservationsClient } from './client';

export const dynamic = 'force-dynamic';

type Reservation = {
  id: string;
  customer_first_name: string;
  customer_phone: string;
  customer_email: string | null;
  party_size: number;
  requested_at: string;
  status:
    | 'REQUESTED'
    | 'CONFIRMED'
    | 'REJECTED'
    | 'CANCELLED'
    | 'NOSHOW'
    | 'COMPLETED';
  notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  table_id: string | null;
  table_label: string | null;
};

type PlanTable = { id: string; label: string; seats?: number };

type Settings = {
  is_enabled: boolean;
  advance_max_days: number;
  advance_min_minutes: number;
  slot_duration_min: number;
  party_size_max: number;
  capacity_per_slot: number;
  notify_email: string | null;
};

const DEFAULT_SETTINGS: Settings = {
  is_enabled: false,
  advance_max_days: 30,
  advance_min_minutes: 60,
  slot_duration_min: 90,
  party_size_max: 12,
  capacity_per_slot: 4,
  notify_email: null,
};

export default async function ReservationsPage() {
  const { tenant } = await getActiveTenant();
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const [resvRes, settingsRes] = await Promise.all([
    sb
      .from('reservations')
      .select(
        'id, customer_first_name, customer_phone, customer_email, party_size, requested_at, status, notes, rejection_reason, created_at, table_id',
      )
      .eq('tenant_id', tenant.id)
      .order('requested_at', { ascending: false })
      .limit(100),
    sb
      .from('reservation_settings')
      .select(
        'is_enabled, advance_max_days, advance_min_minutes, slot_duration_min, party_size_max, capacity_per_slot, notify_email, table_plan',
      )
      .eq('tenant_id', tenant.id)
      .maybeSingle(),
  ]);

  // Build a label lookup from the plan so reservations show "Masa 3" not the
  // opaque "t-x9k2lp" id. If a table is later removed from the plan we fall
  // back to displaying the raw id (denormalised + best-effort by design).
  const planTables: PlanTable[] = Array.isArray(
    (settingsRes.data as { table_plan?: { tables?: PlanTable[] } } | null)?.table_plan?.tables,
  )
    ? ((settingsRes.data as { table_plan: { tables: PlanTable[] } }).table_plan
        .tables ?? [])
    : [];
  const labelById = new Map<string, string>(
    planTables.map((t) => [t.id, t.label]),
  );

  const reservations: Reservation[] = ((resvRes.data ?? []) as Array<
    Omit<Reservation, 'table_label'>
  >).map((r) => ({
    ...r,
    table_label: r.table_id ? labelById.get(r.table_id) ?? r.table_id : null,
  }));
  const settings: Settings = settingsRes.data
    ? (settingsRes.data as Settings)
    : DEFAULT_SETTINGS;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Rezervări
        </h1>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/reservations/table-plan"
            className="text-xs font-medium text-zinc-700 hover:text-zinc-900"
          >
            Plan mese →
          </Link>
          <Link
            href="/dashboard"
            className="text-xs text-zinc-500 hover:text-zinc-900"
          >
            ← Înapoi
          </Link>
        </div>
      </div>

      {!settings.is_enabled && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          Sistemul de rezervări este dezactivat. Activează-l în setări pentru a
          afișa formularul pe storefront.
        </div>
      )}

      <ReservationsClient
        tenantId={tenant.id}
        reservations={reservations}
        settings={settings}
      />
    </div>
  );
}
