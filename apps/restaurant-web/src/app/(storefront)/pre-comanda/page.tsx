import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { resolveTenantFromHost } from '@/lib/tenant';
import { readPreOrderSettings } from '@/lib/pre-orders';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';
import { PreOrderForm } from './form';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return { title: 'Pre-comandă' };
  return {
    title: `Pre-comandă · ${tenant.name}`,
    description: `Programați o comandă în avans la ${tenant.name}.`,
  };
}

export default async function PreOrderPage() {
  const locale = getLocale();
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) notFound();

  const settings = readPreOrderSettings(tenant.settings);

  if (!settings.enabled) {
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-center">
        <CalendarClock className="mx-auto h-8 w-8 text-zinc-400" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-semibold text-zinc-900">{t(locale, 'preOrder.disabled_title')}</h1>
        <p className="mt-2 text-sm text-zinc-500">
          {t(locale, 'preOrder.disabled_body')}
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm font-medium text-zinc-700 underline"
        >
          {t(locale, 'preOrder.back_to_menu')}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <div className="mb-6">
        <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-900">
          {t(locale, 'preOrder.back_to_menu_arrow')}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
          {t(locale, 'preOrder.title')}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {t(locale, 'preOrder.at_restaurant')} <span className="font-medium text-zinc-700">{tenant.name}</span>
        </p>
        <p className="mt-3 text-sm text-zinc-600">
          {t(locale, 'preOrder.description')}
        </p>
      </div>

      <PreOrderForm
        tenantId={tenant.id}
        minAdvanceHours={settings.min_advance_hours}
        maxAdvanceDays={settings.max_advance_days}
        minSubtotalRon={settings.min_subtotal_ron}
      />
    </main>
  );
}
