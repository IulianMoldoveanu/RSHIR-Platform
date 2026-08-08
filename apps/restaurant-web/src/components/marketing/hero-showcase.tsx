import Link from 'next/link';
import { getDemoTenant } from '@/lib/demo/demo-tenant';
import { getMenuByTenant } from '@/lib/menu';
import { brandingFor } from '@/lib/tenant';
import { t, type Locale } from '@/lib/i18n';
import { HeroPhoneMockupScreen } from './hero-phone-mockup-screen';

// The homepage hero — a picture, not a pitch. Iulian 2026-08-02: "exclude si
// scrisul cu afacerea ta, clientii tai etc. prima pagina sa fie direct cu poza
// cu animatie pe telefon si in spate cum arata pe desktop."
//
// Desktop screenshot behind (a real capture of /demo-storefront at 1440px),
// the live animated phone in front. The phone is built from divs against the
// *current* demo tenant rather than being a second screenshot, so the
// animation is real and the frame can't go stale against a UI change.
//
// Best-effort by design: every data read is guarded and falls back to a
// skeleton frame rather than throwing. This is the marketing homepage — it
// must never 500 because a Supabase read hiccupped.

const MAX_ITEMS = 3;

export async function HeroShowcase({ currentLocale }: { currentLocale: Locale }) {
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
    <Link
      href="/demo-storefront"
      className="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-[#4F46E5] focus-visible:outline-offset-4"
      aria-label={t(currentLocale, 'marketing.home.cta_signup')}
    >
      <div className="relative mx-auto max-w-4xl sm:pb-10">
        {/* Desktop. Hidden below `sm`: at phone widths a 1280px-wide dashboard
            scales down to an unreadable smudge, so small screens get the phone
            on its own instead. */}
        <div className="hidden overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-2xl shadow-slate-900/10 transition-transform duration-300 group-hover:-translate-y-1 sm:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/guide/store-desktop.webp"
            alt={t(currentLocale, 'marketing.home.hero_mockup_caption')}
            width={1280}
            height={800}
            decoding="async"
            className="block h-auto w-full"
          />
        </div>

        {/* Phone: centred and on its own below `sm`, overlapping the desktop's
            lower-left corner above it. */}
        <div className="mx-auto w-[220px] sm:absolute sm:-left-2 sm:bottom-0 sm:mx-0 sm:w-[210px] md:-left-8">
          <div className="rounded-[1.75rem] bg-[#0F172A] p-1.5 shadow-2xl shadow-slate-900/30 sm:rounded-[2rem] sm:p-2">
            <div className="overflow-hidden rounded-[1.35rem] bg-white sm:rounded-[1.65rem]">
              {/* Cover */}
              <div className="relative h-16 w-full bg-gradient-to-br from-[#4F46E5] to-[#7C3AED] sm:h-20">
                {coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverUrl} alt="" className="h-full w-full object-cover" width={320} height={80} />
                )}
              </div>

              {/* Tenant row */}
              <div className="flex items-center gap-2 px-3 pb-2 pt-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#4F46E5] text-[10px] font-bold text-white">
                  {name.slice(0, 1)}
                </span>
                <p className="truncate text-[10px] font-bold text-[#0F172A]">{name}</p>
              </div>

              {items.length > 0 ? (
                <HeroPhoneMockupScreen
                  items={items}
                  addedLabel={t(currentLocale, 'marketing.home.hero_mockup_added')}
                  cartLabel={t(currentLocale, 'marketing.home.hero_mockup_cart')}
                  cartEmptyLabel={t(currentLocale, 'marketing.home.hero_mockup_cart_empty')}
                />
              ) : (
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
        </div>
      </div>
    </Link>
  );
}
