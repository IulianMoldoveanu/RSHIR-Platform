import { Sparkles } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { ActivationChecklist } from './activation-checklist-client';

// RSHIR: first-30-day onboarding loop.
// - Within 24h of went_live_at → full confetti celebration banner.
// - Days 1–7 → compact first-week activation playbook.
// - After 7 days → renders null (no cost).
//
// Auto-checkable items (promo_codes, delivery_zones) are queried here on the
// server. Manually-checkable items are handled in the client child via
// localStorage so we keep this component as a server component.

type Props = {
  tenantId: string;
  storefrontUrl: string;
};

type AutoChecks = {
  hasPromo: boolean;
  hasThreeZones: boolean;
};

async function loadAutoChecks(tenantId: string): Promise<AutoChecks> {
  const admin = createAdminClient();
  const [promoRes, zonesRes] = await Promise.all([
    admin
      .from('promo_codes')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_active', true),
    admin
      .from('delivery_zones')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
  ]);
  return {
    hasPromo: (promoRes.count ?? 0) > 0,
    hasThreeZones: (zonesRes.count ?? 0) >= 3,
  };
}

async function loadWentLiveAt(tenantId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single();
  if (!data) return null;
  const settings = (data.settings as Record<string, unknown> | null) ?? {};
  const onboarding =
    settings.onboarding && typeof settings.onboarding === 'object'
      ? (settings.onboarding as Record<string, unknown>)
      : {};
  return typeof onboarding.went_live_at === 'string' ? onboarding.went_live_at : null;
}

export async function GoLiveCelebration({ tenantId, storefrontUrl }: Props) {
  const wentLiveAt = await loadWentLiveAt(tenantId);
  if (!wentLiveAt) return null;

  const ageMs = Date.now() - new Date(wentLiveAt).getTime();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const SEVEN_DAYS = 7 * ONE_DAY;

  if (ageMs > SEVEN_DAYS) return null;

  // Full celebration: first 24 h
  if (ageMs <= ONE_DAY) {
    return (
      <section
        aria-label="Felicitări — ești live!"
        className="overflow-hidden rounded-xl bg-gradient-to-r from-purple-600 via-purple-500 to-fuchsia-500 p-6 text-white shadow-lg"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white/20 text-xl">
              <Sparkles className="h-5 w-5 text-white" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-snug">
                🎉 Storefrontul tău e LIVE!
              </h2>
              <p className="mt-1 max-w-md text-sm text-purple-100">
                Restaurantul dumneavoastră a fost activat cu succes. Distribuiți linkul acum
                pentru a primi primele comenzi.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-none sm:items-center">
            <a
              href="#share"
              className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-purple-700 transition-colors hover:bg-purple-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Distribuie linkul
            </a>
            <a
              href={storefrontUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-lg border border-white/40 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Vezi cum vede clientul
            </a>
            <a
              href="/dashboard/promos"
              className="inline-flex items-center justify-center rounded-lg border border-white/40 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Configurează promoție de lansare
            </a>
          </div>
        </div>
      </section>
    );
  }

  // Days 1–7: compact first-week activation playbook
  const autoChecks = await loadAutoChecks(tenantId);

  return (
    <section
      aria-label="Prima săptămână în HIR"
      className="rounded-xl border border-purple-200 bg-purple-50 p-5"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-purple-600" aria-hidden />
        <h2 className="text-sm font-semibold text-purple-900">Prima săptămână în HIR</h2>
      </div>
      <p className="mt-1 text-xs text-purple-700">
        Activați aceste 5 canale în prima săptămână pentru a decola mai rapid.
      </p>
      <ActivationChecklist
        storefrontUrl={storefrontUrl}
        hasPromo={autoChecks.hasPromo}
        hasThreeZones={autoChecks.hasThreeZones}
      />
    </section>
  );
}
