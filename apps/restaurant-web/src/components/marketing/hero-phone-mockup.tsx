import Link from 'next/link';
import { getDemoTenant } from '@/lib/demo/demo-tenant';
import { getMenuByTenant } from '@/lib/menu';
import { brandingFor } from '@/lib/tenant';
import { t, type Locale } from '@/lib/i18n';
import { HeroPhoneMockupScreen } from './hero-phone-mockup-screen';

// Hero illustration: a phone frame showing the *actual* demo storefront —
// same tenant, same cover photo, same dishes a visitor sees after clicking
// "Vezi demo". Built from divs rather than a screenshot asset so it can never
// go stale against a UI change, and so there's no binary to maintain.
//
// Best-effort by design: every data read is guarded and the component falls
// back to a generic frame rather than throwing. This is the marketing
// homepage — it must never 500 because a Supabase read hiccupped.

const MAX_ITEMS = 3;

export async function HeroPhoneMockup({ currentLocale }: { currentLocale: Locale }) {
  let name = t(currentLocale, 'marketing.home.hero_mockup_fallback_name');
  let coverUrl: string | null = null;
  let items: Array<{ id: string; name: string; price_ron: number; image_url: string | null }> = [];

  try {
    const tenant = await getDemoTenant();
    if (tenant) {
      name = tenant.name;
      coverUrl = brandingFor(tenant.settings).coverUrl;
      const menu = await getMenuByTenant(tenant.id);
      items = menu.flatMap((c) => c.items).slice(0, MAX_ITEMS);
    }
  } catch {
    // Keep the fallback frame — an empty mockup still reads as an illustration.
  }

  return (
    <div className="flex justify-center md:justify-end">
      <Link
        href="/demo-storefront"
        className="group block focus-visible:outline-2 focus-visible:outline-[#4F46E5] focus-visible:outline-offset-4"
        aria-label={t(currentLocale, 'marketing.home.cta_signup')}
      >
        {/* Phone bezel */}
        <div className="relative w-[260px] rounded-[2.25rem] bg-[#0F172A] p-2.5 shadow-2xl shadow-slate-900/25 transition-transform duration-300 group-hover:-translate-y-1 sm:w-[300px]">
          {/* Notch */}
          <div className="absolute left-1/2 top-2.5 z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-[#0F172A]" />

          {/* Screen */}
          <div className="overflow-hidden rounded-[1.75rem] bg-white">
            {/* Cover */}
            <div className="relative h-24 w-full bg-gradient-to-br from-[#4F46E5] to-[#7C3AED]">
              {coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverUrl} alt="" className="h-full w-full object-cover" />
              )}
            </div>

            {/* Tenant row */}
            <div className="flex items-center gap-2 px-3 pb-2 pt-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#4F46E5] text-[11px] font-bold text-white">
                {name.slice(0, 1)}
              </span>
              <p className="truncate text-[11px] font-bold text-[#0F172A]">{name}</p>
            </div>

            {/* Items — cycles the "active" one with a brief add-to-cart
                toast (client component); server only ever passes down the
                already-fetched list. */}
            {items.length > 0 ? (
              <HeroPhoneMockupScreen
                items={items}
                addedLabel={t(currentLocale, 'marketing.home.hero_mockup_added')}
              />
            ) : (
              // Skeleton rows keep the frame from looking broken if the
              // menu read came back empty.
              <div className="flex flex-col gap-1.5 px-3 pb-3">
                {Array.from({ length: MAX_ITEMS }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg border border-[#F1F5F9] p-1.5"
                    aria-hidden
                  >
                    <span className="h-8 w-8 shrink-0 rounded-md bg-[#F1F5F9]" />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="h-2 w-2/3 rounded bg-[#F1F5F9]" />
                      <span className="h-2 w-1/3 rounded bg-[#F1F5F9]" />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-xs font-medium text-[#64748B]">
          {t(currentLocale, 'marketing.home.hero_mockup_caption')}
        </p>
      </Link>
    </div>
  );
}
