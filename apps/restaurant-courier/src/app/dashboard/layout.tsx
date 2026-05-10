import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Package, Clock, Wallet, Settings } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logoutAction, updateCourierLocationAction } from './actions';
import { EarningsBar } from '@/components/earnings-bar';
import { PushBootstrap } from '@/components/push-bootstrap';
import { LocationTracker } from '@/components/location-tracker';
import { ProofSync } from '@/components/proof-sync';
import { RiderModeProvider } from '@/components/rider-mode-provider';
import { RiderModeBadge } from '@/components/rider-mode-badge';
import { resolveRiderMode } from '@/lib/rider-mode';

// Force layout to re-fetch shift state on every navigation. Without this,
// Next.js may serve a cached layout (with stale isOnline) under a freshly
// rendered page (with new shift data), producing the "I'm online but the
// page says offline" desync the user sees.
export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/dashboard/orders', label: 'Comenzi', icon: Package },
  { href: '/dashboard/shift', label: 'Tură', icon: Clock },
  { href: '/dashboard/earnings', label: 'Câștiguri', icon: Wallet },
  { href: '/dashboard/settings', label: 'Setări', icon: Settings },
] as const;

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Are we currently in a shift? Drives the location tracker on/off.
  const admin = createAdminClient();
  const [{ data: shiftData }, riderMode, { count: openOrdersCount }, { data: profileData }] =
    await Promise.all([
      admin
        .from('courier_shifts')
        .select('id')
        .eq('courier_user_id', user.id)
        .eq('status', 'ONLINE')
        .limit(1)
        .maybeSingle(),
      resolveRiderMode(user.id),
      admin
        .from('courier_orders')
        .select('id', { count: 'exact', head: true })
        .is('assigned_courier_user_id', null)
        .in('status', ['CREATED', 'OFFERED']),
      admin
        .from('courier_profiles')
        .select('avatar_url, full_name')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);
  const profile = profileData as { avatar_url: string | null; full_name: string | null } | null;
  const isOnline = !!shiftData;
  // Mode C riders never browse — don't show a count nudge for them.
  const navOrdersBadge = riderMode.mode === 'C' ? 0 : (openOrdersCount ?? 0);

  // Mode A only: pull the rider's single tenant brand for the header.
  // Per decision_courier_three_modes.md, white-label propagation is
  // restricted to Mode A — Mode B+C force HIR neutral so resellers can't
  // fight over whose brand wins on multi-vendor screens.
  const tenantBrand = riderMode.mode === 'A' ? await loadTenantBrand(admin, user.id) : null;

  return (
    <RiderModeProvider value={riderMode}>
      <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
        {/* Header z-[1100] so it always sits above the Leaflet map (whose
            internal panes can climb to z-700 and whose controls can reach
            z-1000 in some plugin builds). Same value on the bottom-nav. */}
        <header className="sticky top-0 z-[1100] flex h-14 items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-950/95 px-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="flex items-center gap-2">
              {tenantBrand?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tenantBrand.logoUrl}
                  alt={tenantBrand.name ?? 'Logo'}
                  className="h-7 w-7 rounded-md object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500 text-xs font-bold text-white"
                >
                  H
                </span>
              )}
              <span className="text-sm font-semibold tracking-tight text-zinc-100">
                {tenantBrand?.name ?? 'HIR Curier'}
              </span>
            </Link>
            {/* Sibling, not child of Link, so Mode-C tap-to-call <a> is not nested inside another <a>. */}
            <RiderModeBadge />
          </div>

          {/* Earnings pill — always visible. */}
          <EarningsBar />

          {/* Avatar shortcut to settings — always visible top-right next to
              logout. Clicking deep-links to /dashboard/settings#profile.
              Falls back to initials if no avatar was uploaded yet. */}
          <Link
            href="/dashboard/settings"
            aria-label="Profil"
            className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-800 bg-zinc-900 hover:border-violet-500/60"
          >
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt="Profil"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-[10px] font-bold uppercase text-zinc-400">
                {(profile?.full_name ?? '?')
                  .split(' ')
                  .map((p) => p[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join('')}
              </span>
            )}
          </Link>

          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
            >
              Ieșire
            </button>
          </form>
        </header>

        <PushBootstrap />
        <LocationTracker enabled={isOnline} onFix={updateCourierLocationAction} />
        <ProofSync />

        <main className="flex-1 px-4 pb-24 pt-6 sm:px-6">{children}</main>

        {/* Bottom nav — primary navigation on mobile (PWA target). z-[1100]
            because Leaflet internal stacking can reach z-700 (popup pane)
            plus leaflet-rotate's control overlay tops out near z-1000.
            Anything below 1100 was visibly losing on iOS Safari. */}
        <nav className="fixed inset-x-0 bottom-0 z-[1100] border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
          <ul className="mx-auto flex max-w-xl items-stretch justify-around">
            {NAV.map((item) => {
              const Icon = item.icon;
              const badgeCount =
                item.href === '/dashboard/orders' && navOrdersBadge > 0 ? navOrdersBadge : 0;
              return (
                <li key={item.href} className="flex-1">
                  <Link
                    href={item.href}
                    className="relative flex flex-col items-center gap-0.5 px-2 py-2 text-[11px] font-medium text-zinc-400 hover:text-violet-400"
                  >
                    <span className="relative">
                      <Icon className="h-5 w-5" aria-hidden />
                      {badgeCount > 0 ? (
                        <span
                          className="absolute -right-2 -top-1 flex min-w-[16px] items-center justify-center rounded-full bg-violet-500 px-1 text-[9px] font-bold text-white"
                          aria-label={`${badgeCount} comenzi disponibile`}
                        >
                          {badgeCount > 9 ? '9+' : badgeCount}
                        </span>
                      ) : null}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </RiderModeProvider>
  );
}

type TenantBrand = { name: string | null; logoUrl: string | null };

// Cheap one-shot lookup: rider's single tenant_members row → tenants.settings.
// Returns null if the rider has 0 or >1 memberships, or the tenant has no
// branding configured (must have either logo_url or settings.public_name —
// we never fall back to tenants.name because that's never null and would
// silently switch every Mode-A rider with a membership away from the
// neutral HIR header). Tolerant of jsonb shape variations.
async function loadTenantBrand(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<TenantBrand | null> {
  try {
    const { data: memberships } = await admin
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', userId)
      .limit(2);

    const rows = (memberships ?? []) as Array<{ tenant_id: string }>;
    if (rows.length !== 1) return null;

    const { data: tenant } = await admin
      .from('tenants')
      .select('settings')
      .eq('id', rows[0].tenant_id)
      .maybeSingle();

    if (!tenant) return null;
    const settings =
      (tenant as { settings: Record<string, unknown> | null }).settings ?? {};
    const branding = (settings.branding as Record<string, unknown> | undefined) ?? {};
    const logoUrl =
      (typeof branding.logo_url === 'string' ? branding.logo_url : null) ??
      (typeof settings.logo_url === 'string' ? settings.logo_url : null);
    const publicName =
      typeof settings.public_name === 'string' && settings.public_name.length > 0
        ? settings.public_name
        : null;

    if (!logoUrl && !publicName) return null;
    return { name: publicName, logoUrl };
  } catch {
    return null;
  }
}
