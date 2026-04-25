// RSHIR-23: live onboarding-state derivation. The persisted
// `tenants.settings.onboarding` block is a cache; this function is the source
// of truth — it counts the underlying records so a tenant who deleted their
// only zone, for example, regresses to "zones_set: false".
//
// `went_live` is the one bit with no live derivation: it's an explicit user
// action recorded in `tenants.settings.onboarding.went_live`. The other three
// flags ignore the cached values entirely.
import { createAdminClient } from './supabase/admin';

export type OnboardingState = {
  menu_added: boolean;
  hours_set: boolean;
  zones_set: boolean;
  went_live: boolean;
  completed_at: string | null;
};

function hasAnyOpeningHours(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  for (const v of Object.values(raw as Record<string, unknown>)) {
    if (Array.isArray(v) && v.length > 0) return true;
  }
  return false;
}

export async function computeOnboardingState(tenantId: string): Promise<OnboardingState> {
  const admin = createAdminClient();

  const [menuRes, tenantRes, zonesRes] = await Promise.all([
    admin
      .from('restaurant_menu_items')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
    admin.from('tenants').select('settings').eq('id', tenantId).single(),
    admin
      .from('delivery_zones')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
  ]);

  const settings = (tenantRes.data?.settings as Record<string, unknown> | null) ?? {};
  const onboarding =
    settings.onboarding && typeof settings.onboarding === 'object'
      ? (settings.onboarding as Record<string, unknown>)
      : {};

  return {
    menu_added: (menuRes.count ?? 0) > 0,
    hours_set: hasAnyOpeningHours(settings.opening_hours),
    zones_set: (zonesRes.count ?? 0) > 0,
    went_live: onboarding.went_live === true,
    completed_at:
      typeof onboarding.completed_at === 'string' ? onboarding.completed_at : null,
  };
}
