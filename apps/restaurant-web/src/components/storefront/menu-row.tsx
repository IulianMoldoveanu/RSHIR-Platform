import { MenuItemCard } from './menu-item-card';
import type { MenuCategory } from '@/lib/menu';
import type { Locale } from '@/lib/i18n';

export function MenuRow({ category, locale }: { category: MenuCategory; locale: Locale }) {
  if (category.items.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="px-4 text-base font-semibold tracking-tight text-zinc-900 sm:text-lg">
        {category.name}
      </h2>
      <div
        className="no-scrollbar mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {category.items.map((it) => (
          <MenuItemCard key={it.id} item={it} modifiers={it.modifiers} locale={locale} />
        ))}
      </div>
    </section>
  );
}
