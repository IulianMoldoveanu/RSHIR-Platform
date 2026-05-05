import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { resolveTenantFromHost } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { ReservationForm } from './form';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return { title: 'Rezervare' };
  return {
    title: `Rezervă o masă · ${tenant.name}`,
    description: `Rezervă online o masă la ${tenant.name}.`,
  };
}

type PlanTable = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  seats: number;
  label: string;
  shape?: 'rect' | 'round';
};

type Settings = {
  is_enabled: boolean;
  advance_max_days: number;
  advance_min_minutes: number;
  party_size_max: number;
  show_table_plan_to_customers: boolean;
  table_plan: { tables: PlanTable[] } | null;
};

export default async function ReservationsPage() {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) notFound();

  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data: settingsRow } = await sb
    .from('reservation_settings')
    .select(
      'is_enabled, advance_max_days, advance_min_minutes, party_size_max, show_table_plan_to_customers, table_plan',
    )
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  const settings: Settings | null = settingsRow ?? null;

  if (!settings || !settings.is_enabled) {
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-center">
        <h1 className="text-xl font-semibold text-zinc-900">Rezervări</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Rezervările online nu sunt încă disponibile pentru acest restaurant.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm font-medium text-zinc-700 underline"
        >
          Înapoi la meniu
        </Link>
      </main>
    );
  }

  // Only render the picker if the operator opted in AND defined at least one
  // table — empty plan + toggle on = falls back to the request form so the
  // tenant doesn't get a broken UX during plan setup.
  const planTables = Array.isArray(settings.table_plan?.tables)
    ? settings.table_plan!.tables
    : [];
  const showPlan = settings.show_table_plan_to_customers && planTables.length > 0;

  return (
    <main className={showPlan ? 'mx-auto max-w-3xl px-4 py-8' : 'mx-auto max-w-md px-4 py-8'}>
      <div className="mb-6">
        <Link
          href="/"
          className="text-xs text-zinc-500 hover:text-zinc-900"
        >
          ← Înapoi la meniu
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
          Rezervă o masă
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          la <span className="font-medium text-zinc-700">{tenant.name}</span>
        </p>
      </div>

      <ReservationForm
        advanceMinMinutes={settings.advance_min_minutes}
        advanceMaxDays={settings.advance_max_days}
        partySizeMax={settings.party_size_max}
        tenantId={tenant.id}
        plan={showPlan ? planTables : null}
      />

      <p className="mt-6 text-center text-xs text-zinc-400">
        Restaurantul va confirma rezervarea în scurt timp prin telefon sau email.
      </p>
    </main>
  );
}
