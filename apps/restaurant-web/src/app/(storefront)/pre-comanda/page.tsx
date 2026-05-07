import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { resolveTenantFromHost } from '@/lib/tenant';
import { readPreOrderSettings } from '@/lib/pre-orders';
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
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) notFound();

  const settings = readPreOrderSettings(tenant.settings);

  if (!settings.enabled) {
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-center">
        <CalendarClock className="mx-auto h-8 w-8 text-zinc-400" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-semibold text-zinc-900">Pre-comenzi</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Pre-comenzile online nu sunt încă disponibile pentru acest restaurant.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm font-medium text-zinc-700 underline"
        >
          Înapoi la meniu
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <div className="mb-6">
        <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-900">
          ← Înapoi la meniu
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
          Pre-comandă
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          la <span className="font-medium text-zinc-700">{tenant.name}</span>
        </p>
        <p className="mt-3 text-sm text-zinc-600">
          Adăugați produsele în coș de pe pagina principală, apoi alegeți data
          și ora la care doriți comanda. Restaurantul vă va contacta pentru
          confirmare și plată.
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
