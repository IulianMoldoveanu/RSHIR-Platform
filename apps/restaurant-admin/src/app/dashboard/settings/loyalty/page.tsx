import Link from 'next/link';
import { getActiveTenant } from '@/lib/tenant';
import { getLoyaltySettings } from '@/lib/loyalty';
import { LoyaltyClient } from './client';

export const dynamic = 'force-dynamic';

const DEFAULTS = {
  is_enabled: false,
  points_per_ron: 0.2,
  ron_per_point: 0.1,
  min_points_to_redeem: 50,
  max_redemption_pct: 30,
  expiry_days: 365,
  welcome_bonus_points: 0,
};

export default async function LoyaltySettingsPage() {
  const { tenant } = await getActiveTenant();
  const current = (await getLoyaltySettings(tenant.id)) ?? DEFAULTS;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Loialitate &amp; recompense
        </h1>
        <Link
          href="/dashboard/settings"
          className="text-xs text-zinc-500 hover:text-zinc-900"
        >
          ← inapoi la setari
        </Link>
      </div>

      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
        Clienții acumulează puncte la fiecare comandă livrată. Pot apoi folosi
        punctele ca discount la comenzile viitoare. Sistem dezactivat implicit;
        activează-l când vrei.
      </div>

      <LoyaltyClient tenantId={tenant.id} initial={current} />
    </div>
  );
}
