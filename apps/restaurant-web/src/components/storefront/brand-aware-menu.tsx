'use client';

import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { MenuBrand, MenuCategory } from '@/lib/menu';
import { MenuList } from './menu-list';
import type { Locale } from '@/lib/i18n';

// Delivery House model: one physical kitchen, several customer-facing
// brands (Chicken Press, Brunch House, Egg & Smash House, ...). Categories
// carry an optional `menu_brand_id`; when a tenant has zero configured
// brands (the vast majority — one restaurant, one menu) this renders
// nothing but <MenuList> unchanged. Cart/checkout already work cross-brand
// with no changes (see useCart.ts / computeQuote) — this is purely a
// browse-time filter, not a data-model boundary.
export function BrandAwareMenu({
  categories,
  brands,
  locale,
}: {
  categories: MenuCategory[];
  brands: MenuBrand[];
  locale: Locale;
}) {
  const [activeBrandId, setActiveBrandId] = useState<string | null>(brands[0]?.id ?? null);
  const reduceMotion = useReducedMotion();

  const visible = useMemo(() => {
    if (brands.length === 0) return categories;
    return categories.filter((c) => c.menu_brand_id === activeBrandId);
  }, [categories, brands.length, activeBrandId]);

  if (brands.length === 0) {
    return <MenuList categories={categories} locale={locale} />;
  }

  return (
    <>
      <div className="mx-auto max-w-2xl px-4 pt-3">
        <div className="-mx-1 flex gap-2 overflow-x-auto pb-2" role="tablist">
          {brands.map((b) => {
            const active = b.id === activeBrandId;
            return (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveBrandId(b.id)}
                className={`relative flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold tracking-tight transition-colors ${
                  active
                    ? 'border-transparent text-white shadow-sm'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                {/* Sliding active background — Wolt-style, brand-colored.
                    Same layoutId across brand tabs so framer morphs the pill
                    smoothly between selections. Matches CategoryTabs. */}
                {active ? (
                  <motion.span
                    layoutId="brand-tab-active"
                    className="absolute inset-0 rounded-full"
                    style={{ backgroundColor: 'var(--hir-brand, #7c3aed)' }}
                    transition={{
                      type: 'spring',
                      stiffness: 500,
                      damping: 35,
                      duration: reduceMotion ? 0 : undefined,
                    }}
                  />
                ) : null}
                {b.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={b.logo_url}
                    alt=""
                    width={20}
                    height={20}
                    className="relative z-10 h-5 w-5 shrink-0 rounded-full object-cover"
                  />
                ) : null}
                <span className="relative z-10">{b.name}</span>
              </button>
            );
          })}
        </div>
      </div>
      <MenuList categories={visible} locale={locale} />
    </>
  );
}
