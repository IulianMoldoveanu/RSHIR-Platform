import type { ReactNode } from 'react';
import Link from 'next/link';
import { User } from 'lucide-react';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateCourierLocationAction } from './actions';
import { EarningsBar } from '@/components/earnings-bar';
import { PushBootstrap } from '@/components/push-bootstrap';
import { LocationTracker } from '@/components/location-tracker';
import { ProofSync } from '@/components/proof-sync';
import { TransitionSync } from '@/components/transition-sync';
import { OfflineBanner } from '@/components/offline-banner';
import { BatterySaverBadge } from '@/components/battery-saver-badge';
import { BatteryCriticalToast } from '@/components/battery-critical-toast';
import { RiderModeProvider } from '@/components/rider-mode-provider';
import { RiderModeBadge } from '@/components/rider-mode-badge';
import { resolveRiderMode } from '@/lib/rider-mode';
import { OnboardingOverlays } from '@/components/onboarding-overlays';
import { ConnectionBadge } from '@/components/connection-badge';
import { BatteryBadge } from '@/components/battery-badge';
import { GpsStalnessPill } from '@/components/gps-staleness-pill';
import { GpsTimestampProvider } from '@/lib/gps-timestamp-context';
import { LocationTrackerWired } from '@/components/location-tracker-wired';
import { BackgroundLocationRationale } from '@/components/background-location-rationale';
import { CourierPresenceBroadcaster } from '@/components/courier-presence-broadcaster';
import { PageTransition } from '@/components/page-transition';
import { BottomNav } from '@/components/bottom-nav';
import { CapacitorBootstrap } from '@/components/capacitor-bootstrap';

// Force layout to re-fetch shift state on every navigation. Without this,
// Next.js may serve a cached layout (with stale isOnline) under a freshly
// rendered page (with new shift data), producing the "I'm online but the
// page says offline" desync the user sees.
export const dynamic = 'force-dynamic';


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
        .select('avatar_url, full_name, fleet_id')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);
  const profile = profileData as {
    avatar_url: string | null;
    full_name: string | null;
    fleet_id: string | null;
  } | null;

  const isOnline = !!shiftData;
  // Mode C riders never browse — don't show a count nudge for them.
  const navOrdersBadge = riderMode.mode === 'C' ? 0 : (openOrdersCount ?? 0);

  // Mode A only: pull the rider's single tenant brand for the header.
  // Per decision_courier_three_modes.md, white-label propagation is
  // restricted to Mode A — Mode B+C force HIR neutral so resellers can't
  // fight over whose brand wins on multi-vendor screens.
  const tenantBrand = riderMode.mode === 'A' ? await loadTenantBrand(admin, user.id) : null;

  // Avatar initials from the courier's name; falls back to a person icon when
  // the profile has no name (fresh/test accounts) instead of showing "?".
  const avatarInitials = (profile?.full_name ?? '')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <GpsTimestampProvider>
    <RiderModeProvider value={riderMode}>
      <div className="flex min-h-screen flex-col bg-hir-bg text-hir-fg">
        {/* Skip-to-content: visible on focus for keyboard + AT users. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[2000] focus:rounded-lg focus:bg-violet-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:outline-none"
        >
          Sari la conținut
        </a>
        {/* Header z-[1100] so it always sits above the Leaflet map (whose
            internal panes can climb to z-700 and whose controls can reach
            z-1000 in some plugin builds). Same value on the bottom-nav.
            Chrome surfaces (header bg + border) use semantic tokens so
            the theme toggle (F4.5) flips them without per-class overrides. */}
        {/* paddingTop = OS safe-area inset: capacitor.config StatusBar
            overlaysWebView:true draws the WebView under the status bar, so
            without this the logo sits behind the clock/battery on native.
            min-h-14 (not h-14) so the inset is added on top of the 56px chrome
            row instead of compressing it (Tailwind box-sizing: border-box). */}
        <header
          className="sticky top-0 z-[1100] flex min-h-14 items-center justify-between gap-2 border-b border-hir-border bg-hir-bg/95 px-3 backdrop-blur"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
              {tenantBrand?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tenantBrand.logoUrl}
                  alt={tenantBrand.name ?? 'Logo'}
                  className="h-7 w-7 rounded-md object-cover"
                />
              ) : tenantBrand?.name ? (
                // Mode-A rider without a logo: keep the employer's accent + initial.
                <span
                  aria-hidden
                  className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold text-white"
                  style={{
                    background: tenantBrand.accentColor ?? 'rgb(139, 92, 246)',
                  }}
                >
                  {tenantBrand.name.slice(0, 1).toUpperCase()}
                </span>
              ) : (
                // HIR-direct courier: the MOV-1 brand icon (same asset as the
                // launcher / PWA icon) so the header matches the chosen brand.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/icon-192.png"
                  alt="HIR Curier"
                  className="h-7 w-7 rounded-md object-cover"
                />
              )}
              <span className="hidden truncate text-sm font-semibold tracking-tight text-hir-fg sm:inline">
                {tenantBrand?.name ?? 'HIR Curier'}
              </span>
            </Link>
            {/* Sibling, not child of Link, so Mode-C tap-to-call <a> is not nested inside another <a>. */}
            <RiderModeBadge />
          </div>

          {/* Earnings pill — always visible. */}
          <EarningsBar />

          {/* Live status badges — connection quality + battery (only when low)
              + GPS staleness. Tucked between earnings and help so the user
              gets at-a-glance device health without crowding the chrome. */}
          <div className="flex shrink-0 items-center gap-1">
            <ConnectionBadge />
            <BatteryBadge />
            {/* GPS-freshness pill is redundant with the map greeting card and
                crowds the header on phones — show it only from sm up. */}
            <div className="hidden sm:block">
              <GpsStalnessPill />
            </div>
          </div>

          {/* Avatar shortcut to settings — primary tap target for profile,
              docs, theme, and logout. Settings is the canonical home for
              all account actions, so we removed the redundant "Iesire"
              button that duplicated the Deconectare row in settings. The
              avatar gets a sharper hover ring + violet outline so it
              reads as the rightmost action affordance. Tap target min
              44x44 for WCAG 2.5.5; visual avatar stays 32x32. */}
          <Link
            href="/dashboard/settings"
            aria-label="Profil și setări"
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center"
          >
            <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-hir-border bg-hir-surface transition-colors hover:border-violet-400 hover:ring-2 hover:ring-violet-500/30 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2">
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt="Profil"
                  className="h-full w-full object-cover"
                />
              ) : avatarInitials ? (
                <span className="text-[10px] font-bold uppercase text-hir-muted-fg">
                  {avatarInitials}
                </span>
              ) : (
                <User className="h-4 w-4 text-hir-muted-fg" aria-hidden strokeWidth={2.25} />
              )}
            </span>
          </Link>
        </header>

        <OfflineBanner />
        <BatterySaverBadge />
        <BatteryCriticalToast />
        <CapacitorBootstrap />
        <PushBootstrap />
        {/* Prominent background-location disclosure (Google Play). Mounted in
            the layout so it shows on ANY dashboard route before the watcher
            below can trigger the OS "Allow all the time" prompt. Self-gates to
            first-time Android; renders nothing otherwise. */}
        <BackgroundLocationRationale />
        <LocationTrackerWired enabled={isOnline} onFix={updateCourierLocationAction} />
        <CourierPresenceBroadcaster userId={user.id} fleetId={profile?.fleet_id ?? null} />
        <ProofSync />
        <TransitionSync />

        {/* First-run overlays — client-only, each checks localStorage before
            rendering so returning couriers pay zero overhead. The chunks
            are lazy-loaded post-paint via OnboardingOverlays so they
            never sit on the critical path. */}
        <OnboardingOverlays />

        <main id="main-content" className="flex-1 px-4 pb-24 pt-6 sm:px-6">
          <PageTransition>{children}</PageTransition>
        </main>

        {/* Bottom nav — primary navigation on mobile (PWA target). z-[1100]
            because Leaflet internal stacking can reach z-700 (popup pane)
            plus leaflet-rotate's control overlay tops out near z-1000.
            BottomNav highlights the active tab + animates a violet bar
            between tabs via framer-motion layoutId. */}
        <BottomNav ordersBadge={navOrdersBadge} />
      </div>
    </RiderModeProvider>
    </GpsTimestampProvider>
  );
}

type TenantBrand = {
  name: string | null;
  logoUrl: string | null;
  /**
   * Tenant-owned accent color (hex string `#rrggbb` or `#rgb`). Applied to
   * the header logo fallback square only — we deliberately don't repaint
   * the whole UI in tenant colors because the rider's swipe gestures rely
   * on a single, learned violet accent across all surfaces. The header
   * square is the visible "you are working for X today" cue.
   */
  accentColor: string | null;
};

// Conservative hex-color sanitizer. Rejects any non-#rgb/#rrggbb shape so
// a malformed `tenants.settings.branding.accent_color` can't inject CSS or
// fall through as a raw word. Returns null on reject so the caller falls
// back to the default violet.
function sanitizeAccentColor(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) return null;
  return trimmed;
}

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
    const accentColor = sanitizeAccentColor(branding.accent_color);

    if (!logoUrl && !publicName && !accentColor) return null;
    return { name: publicName, logoUrl, accentColor };
  } catch {
    return null;
  }
}
