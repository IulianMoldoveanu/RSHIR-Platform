import { notFound } from 'next/navigation';
import { resolveTenantFromHost } from '@/lib/tenant';
import { CheckoutClient } from './CheckoutClient';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) notFound();

  const tenantPhone = readPhone(tenant.settings) ?? '';

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-widest text-zinc-400">{tenant.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Finalizează comanda</h1>
      </header>

      <CheckoutClient
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        tenantName={tenant.name}
        tenantPhone={tenantPhone}
      />
    </main>
  );
}

function readPhone(settings: unknown): string | null {
  if (settings && typeof settings === 'object') {
    const s = settings as Record<string, unknown>;
    const wa = typeof s.whatsapp_phone === 'string' ? s.whatsapp_phone : null;
    const ph = typeof s.phone === 'string' ? s.phone : null;
    return wa ?? ph ?? null;
  }
  return null;
}
