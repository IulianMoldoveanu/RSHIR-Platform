import Link from 'next/link';
import {
  Megaphone,
  FileText,
  Send,
  BarChart3,
  Settings as SettingsIcon,
  Sparkles,
} from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';

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

  // Fetch this tenant's content brand contexts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data: brandsData } = await sb
    .from('content_brand_contexts')
    .select('id, brand_code, display_name, tier, is_active, preferred_messaging')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: true });

  const brands: ContentBrand[] = (brandsData ?? []) as ContentBrand[];

  // For each brand, fetch counts (lightweight HEAD queries).
  const counts: Record<string, Counts> = {};
  for (const brand of brands) {
    const [pending, approved, live, scheduled] = await Promise.all([
      sb.from('content_drafts')
        .select('id', { count: 'exact', head: true })
        .in('brief_id',
          sb.from('content_briefs').select('id').eq('brand_id', brand.id))
        .eq('status', 'draft'),
      sb.from('content_drafts')
        .select('id', { count: 'exact', head: true })
        .in('brief_id',
          sb.from('content_briefs').select('id').eq('brand_id', brand.id))
        .eq('status', 'approved'),
      sb.from('content_publications')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published'),
      sb.from('content_publications')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'queued'),
    ]);
    counts[brand.id] = {
      draftsPending: pending.count ?? 0,
      draftsApproved: approved.count ?? 0,
      publicationsLive: live.count ?? 0,
      publicationsScheduled: scheduled.count ?? 0,
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
