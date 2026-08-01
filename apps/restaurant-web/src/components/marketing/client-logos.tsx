import { getSupabase } from '@/lib/supabase';
import { brandingFor, type TenantSettings } from '@/lib/tenant';
import { t, type Locale } from '@/lib/i18n';

// Social proof pulled live from the tenants actually running on the platform,
// via the same anon-safe view sitemap.ts already reads. No static logo assets
// to curate or keep in sync — a new tenant with a logo shows up here on its
// own, and a churned one disappears.
//
// Renders nothing below MIN_LOGOS: a "trusted by" wall with two logos reads
// as thinner than no wall at all. Any query failure also renders nothing —
// this is decorative trust-building, never load-bearing.

const MIN_LOGOS = 3;
const MAX_LOGOS = 12;

type Row = { slug: string; name: string; settings: TenantSettings };

export async function ClientLogos({ currentLocale }: { currentLocale: Locale }) {
  let logos: Array<{ slug: string; name: string; url: string }> = [];

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('v_tenants_storefront')
      .select('slug, name, settings')
      .eq('status', 'ACTIVE')
      .limit(MAX_LOGOS);
    if (error) return null;

    logos = ((data ?? []) as Row[])
      .map((r) => ({ slug: r.slug, name: r.name, url: brandingFor(r.settings ?? {}).logoUrl }))
      .filter((r): r is { slug: string; name: string; url: string } => Boolean(r.url));
  } catch {
    return null;
  }

  if (logos.length < MIN_LOGOS) return null;

  return (
    <section className="border-b border-[#E2E8F0] bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="text-center text-xs font-medium uppercase tracking-wider text-[#94A3B8]">
          {t(currentLocale, 'marketing.home.logos_title')}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
          {logos.map((logo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={logo.slug}
              src={logo.url}
              alt={logo.name}
              loading="lazy"
              className="h-9 w-auto max-w-[120px] object-contain opacity-60 grayscale transition-all duration-200 hover:opacity-100 hover:grayscale-0"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
