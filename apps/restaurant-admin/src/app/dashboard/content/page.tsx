import Link from 'next/link';
import {
  Megaphone,
  FileText,
  Send,
  BarChart3,
  Settings as SettingsIcon,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';
import {
  getUsageSnapshot,
  capResourceLabel,
  capExceededMessage,
  type CapSnapshot,
} from '@/lib/usage-caps';

export const dynamic = 'force-dynamic';

type ContentBrand = {
  id: string;
  brand_code: string;
  display_name: string;
  tier: 'basic' | 'pro' | 'enterprise';
  is_active: boolean;
  preferred_messaging: 'whatsapp' | 'telegram';
};

type Counts = {
  draftsPending: number;
  draftsApproved: number;
  publicationsLive: number;
  publicationsScheduled: number;
};

const TIER_LABEL: Record<ContentBrand['tier'], { label: string; tone: string }> = {
  basic: { label: 'Basic', tone: 'bg-zinc-100 text-zinc-700 border-zinc-300' },
  pro: { label: 'Pro', tone: 'bg-violet-100 text-violet-800 border-violet-300' },
  enterprise: { label: 'Enterprise', tone: 'bg-amber-100 text-amber-800 border-amber-300' },
};

export default async function ContentDashboardPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { tenant } = await getActiveTenant();
  const admin = createAdminClient();

  // Standard-plan usage snapshot — surface at-cap / near-cap resources
  // as a friendly banner above the brand cards. See lib/usage-caps.ts.
  const usageSnapshot = await getUsageSnapshot(tenant.id);
  const capAlerts = usageSnapshot.filter((s) => s.atCap || s.nearCap);

  // Fetch this tenant's content brand contexts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data: brandsData } = await sb
    .from('content_brand_contexts')
    .select('id, brand_code, display_name, tier, is_active, preferred_messaging')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: true });

  const brands: ContentBrand[] = (brandsData ?? []) as ContentBrand[];

  // For each brand, fetch counts. Codex P1+P2 absorb:
  //   - .in() needs an array of values, NOT a query builder; previous
  //     pattern threw at runtime and 500'd the page.
  //   - publication counts were unscoped (counted ALL tenants' rows).
  //     Now we resolve brief ids + draft ids first, then count
  //     publications whose draft_id ∈ that set.
  const counts: Record<string, Counts> = {};
  for (const brand of brands) {
    // 1. Brief ids for this brand.
    const { data: briefRows } = await sb
      .from('content_briefs')
      .select('id')
      .eq('brand_id', brand.id);
    const briefIds: string[] = (briefRows ?? []).map((r: { id: string }) => r.id);

    if (briefIds.length === 0) {
      counts[brand.id] = {
        draftsPending: 0,
        draftsApproved: 0,
        publicationsLive: 0,
        publicationsScheduled: 0,
      };
      continue;
    }

    // 2. Draft ids for those briefs (any status — used by publication scope).
    const { data: draftRows } = await sb
      .from('content_drafts')
      .select('id, status')
      .in('brief_id', briefIds);
    const allDrafts = (draftRows ?? []) as Array<{ id: string; status: string }>;
    const draftIds = allDrafts.map((d) => d.id);
    const draftsPending = allDrafts.filter((d) => d.status === 'draft').length;
    const draftsApproved = allDrafts.filter((d) => d.status === 'approved').length;

    // 3. Publication counts scoped to this brand's drafts only.
    let publicationsLive = 0;
    let publicationsScheduled = 0;
    if (draftIds.length > 0) {
      const [{ count: liveCount }, { count: schedCount }] = await Promise.all([
        sb.from('content_publications')
          .select('id', { count: 'exact', head: true })
          .in('draft_id', draftIds)
          .eq('status', 'published'),
        sb.from('content_publications')
          .select('id', { count: 'exact', head: true })
          .in('draft_id', draftIds)
          .eq('status', 'queued'),
      ]);
      publicationsLive = liveCount ?? 0;
      publicationsScheduled = schedCount ?? 0;
    }

    counts[brand.id] = {
      draftsPending,
      draftsApproved,
      publicationsLive,
      publicationsScheduled,
    };
  }

  // Empty state — no brand yet. Funnel to onboarding wizard.
  if (brands.length === 0) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-violet-50 to-white p-8 text-center shadow-sm">
          <Sparkles className="mx-auto h-12 w-12 text-violet-500" aria-hidden />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900">
            Hepi devine social media manager-ul tău
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-600">
            Conectează WhatsApp sau Telegram, alege canalele sociale, și
            primește reclame automate pentru restaurant. Setup în 5 minute.
          </p>
          <Link
            href="/dashboard/content/onboard"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-500"
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            Începe acum
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 py-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Content OS</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Generare automată + publicare pe rețele sociale via Hepi.
          </p>
        </div>
        <Link
          href="/dashboard/content/onboard"
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <SettingsIcon className="h-4 w-4" aria-hidden />
          Conectează încă un brand
        </Link>
      </header>

      {capAlerts.length > 0 && <CapBanner alerts={capAlerts} />}

      <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
        <span className="font-semibold">Hepi îți generează drafts</span> în
        fiecare dimineață la 06:00 UTC.{' '}
        <Link href="/dashboard/content/drafts" className="font-semibold underline hover:no-underline">
          Vezi drafts-urile
        </Link>{' '}
        sau scrie-i pe WhatsApp/Telegram cu <code className="rounded bg-violet-100 px-1 py-0.5 text-xs">/reclama</code>.
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {brands.map((brand) => {
          const c = counts[brand.id];
          const tier = TIER_LABEL[brand.tier];
          return (
            <div
              key={brand.id}
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-zinc-900">
                      {brand.display_name}
                    </h2>
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tier.tone}`}
                    >
                      {tier.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {brand.brand_code} · {brand.preferred_messaging === 'whatsapp' ? 'WhatsApp' : 'Telegram'}
                  </p>
                </div>
                {!brand.is_active && (
                  <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-500">
                    Inactiv
                  </span>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Link
                  href={`/dashboard/content/drafts?brand=${brand.id}`}
                  className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2.5 transition-colors hover:bg-amber-100"
                >
                  <span className="flex items-center gap-2 text-amber-800">
                    <FileText className="h-4 w-4" aria-hidden />
                    Drafts pending
                  </span>
                  <span className="font-bold text-amber-900">{c.draftsPending}</span>
                </Link>
                <Link
                  href={`/dashboard/content/drafts?brand=${brand.id}&status=approved`}
                  className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2.5 transition-colors hover:bg-emerald-100"
                >
                  <span className="flex items-center gap-2 text-emerald-800">
                    <Send className="h-4 w-4" aria-hidden />
                    Aprobate
                  </span>
                  <span className="font-bold text-emerald-900">{c.draftsApproved}</span>
                </Link>
                <Link
                  href={`/dashboard/content/publications?brand=${brand.id}`}
                  className="flex items-center justify-between rounded-lg bg-violet-50 px-3 py-2.5 transition-colors hover:bg-violet-100"
                >
                  <span className="flex items-center gap-2 text-violet-800">
                    <Megaphone className="h-4 w-4" aria-hidden />
                    Postate
                  </span>
                  <span className="font-bold text-violet-900">{c.publicationsLive}</span>
                </Link>
                <Link
                  href={`/dashboard/content/publications?brand=${brand.id}&status=queued`}
                  className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2.5 transition-colors hover:bg-blue-100"
                >
                  <span className="flex items-center gap-2 text-blue-800">
                    <BarChart3 className="h-4 w-4" aria-hidden />
                    Programate
                  </span>
                  <span className="font-bold text-blue-900">{c.publicationsScheduled}</span>
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600">
        <strong>Cum comanzi reclame către Hepi:</strong> scrie direct pe
        WhatsApp/Telegram (ex: <em>&ldquo;Fă o reclamă pentru pizza Margherita 25 RON&rdquo;</em>)
        sau folosește butonul <em>Comandă nouă</em> din ecranul drafts.
      </div>
    </div>
  );
}

function CapBanner({ alerts }: { alerts: CapSnapshot[] }) {
  // Split into at-cap (red) and near-cap (amber). The polite copy comes
  // from `capExceededMessage` so the patron sees the same wording on the
  // dashboard, in the 429 response body, and on WhatsApp.
  const atCap = alerts.filter((a) => a.atCap);
  const nearCap = alerts.filter((a) => a.nearCap);

  return (
    <div className="flex flex-col gap-3">
      {atCap.map((a) => (
        <div
          key={`atcap-${a.resourceKind}`}
          className="rounded-lg border border-rose-200 bg-rose-50 p-4"
          role="alert"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-600" aria-hidden />
            <div className="flex-1">
              <p className="text-sm font-semibold text-rose-900">
                {capResourceLabel(a.resourceKind)}: {a.used}/{a.cap} utilizate{' '}
                {a.periodKind === 'daily' ? 'astăzi' : 'luna asta'}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-rose-800">
                {capExceededMessage(a.resourceKind, a.cap, a.periodKind)}
              </p>
            </div>
          </div>
        </div>
      ))}
      {nearCap.map((a) => (
        <div
          key={`near-${a.resourceKind}`}
          className="rounded-lg border border-amber-200 bg-amber-50 p-4"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" aria-hidden />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900">
                {capResourceLabel(a.resourceKind)}: {a.used}/{a.cap} utilizate{' '}
                {a.periodKind === 'daily' ? 'astăzi' : 'luna asta'}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-800">
                Te apropii de cap-ul planului Standard. Dacă ai nevoie de mai mult, scrie la +40 723 XXX XXX.
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
