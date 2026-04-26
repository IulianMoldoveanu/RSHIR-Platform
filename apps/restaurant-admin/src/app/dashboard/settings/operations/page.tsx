import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { OperationsClient } from './operations-client';
import type { OperationsSettings } from './actions';

export const dynamic = 'force-dynamic';

const DEFAULTS: OperationsSettings = {
  is_accepting_orders: true,
  pause_reason: null,
  pickup_eta_minutes: 30,
  pickup_enabled: true,
  pickup_address: null,
  min_order_ron: 0,
  free_delivery_threshold_ron: 0,
  delivery_eta_min_minutes: 0,
  delivery_eta_max_minutes: 0,
  opening_hours: {
    mon: [{ open: '10:00', close: '22:00' }],
    tue: [{ open: '10:00', close: '22:00' }],
    wed: [{ open: '10:00', close: '22:00' }],
    thu: [{ open: '10:00', close: '22:00' }],
    fri: [{ open: '10:00', close: '23:00' }],
    sat: [{ open: '10:00', close: '23:00' }],
    sun: [{ open: '12:00', close: '22:00' }],
  },
};

export default async function OperationsSettingsPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);

  const admin = createAdminClient();
  const { data } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', tenant.id)
    .single();
  const settings = (data?.settings as Record<string, unknown> | null) ?? {};

  const initial: OperationsSettings = {
    is_accepting_orders:
      typeof settings.is_accepting_orders === 'boolean'
        ? settings.is_accepting_orders
        : DEFAULTS.is_accepting_orders,
    pause_reason:
      typeof settings.pause_reason === 'string' ? settings.pause_reason : null,
    pickup_eta_minutes:
      typeof settings.pickup_eta_minutes === 'number' && settings.pickup_eta_minutes > 0
        ? settings.pickup_eta_minutes
        : DEFAULTS.pickup_eta_minutes,
    pickup_enabled:
      typeof settings.pickup_enabled === 'boolean'
        ? settings.pickup_enabled
        : DEFAULTS.pickup_enabled,
    pickup_address:
      typeof settings.pickup_address === 'string' ? settings.pickup_address : null,
    min_order_ron:
      typeof settings.min_order_ron === 'number' && settings.min_order_ron >= 0
        ? settings.min_order_ron
        : DEFAULTS.min_order_ron,
    free_delivery_threshold_ron:
      typeof settings.free_delivery_threshold_ron === 'number' &&
      settings.free_delivery_threshold_ron >= 0
        ? settings.free_delivery_threshold_ron
        : DEFAULTS.free_delivery_threshold_ron,
    delivery_eta_min_minutes:
      typeof settings.delivery_eta_min_minutes === 'number' &&
      settings.delivery_eta_min_minutes >= 0
        ? settings.delivery_eta_min_minutes
        : DEFAULTS.delivery_eta_min_minutes,
    delivery_eta_max_minutes:
      typeof settings.delivery_eta_max_minutes === 'number' &&
      settings.delivery_eta_max_minutes >= 0
        ? settings.delivery_eta_max_minutes
        : DEFAULTS.delivery_eta_max_minutes,
    opening_hours:
      settings.opening_hours && typeof settings.opening_hours === 'object'
        ? { ...DEFAULTS.opening_hours, ...(settings.opening_hours as OperationsSettings['opening_hours']) }
        : DEFAULTS.opening_hours,
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Operațiuni & program
        </h1>
        <p className="text-sm text-zinc-600">
          Pune restaurantul pe pauză temporar și definește programul săptămânal.
          Programul se interpretează în Europa/București.
        </p>
      </header>

      {role !== 'OWNER' && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Doar utilizatorii cu rolul <strong>OWNER</strong> pot modifica programul.
        </div>
      )}

      <OperationsClient initial={initial} canEdit={role === 'OWNER'} tenantId={tenant.id} />
    </div>
  );
}
