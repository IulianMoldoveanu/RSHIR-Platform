// Sales register export — SmartBill / SAGA monthly CSV for the accountant.
// Read-only over restaurant_orders; only mutates fiscal config in
// tenants.settings.fiscal (CUI, legal name, default VAT rate).

import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { readFiscal } from '@/lib/fiscal';
import { ExportsClient } from './exports-client';

export const dynamic = 'force-dynamic';

export default async function ExportsSettingsPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);

  const admin = createAdminClient();
  const { data: tenantRow } = await admin
    .from('tenants')
    .select('settings, name')
    .eq('id', tenant.id)
    .maybeSingle();
  const fiscal = readFiscal(tenantRow?.settings, tenantRow?.name ?? tenant.name);

  // Default month = previous calendar month (the typical accountant
  // workflow: on the 5th, export everything from the month that just closed).
  const now = new Date();
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const defaultYear = prev.getUTCFullYear();
  const defaultMonth = prev.getUTCMonth() + 1;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Export pentru contabilitate
        </h1>
        <p className="text-sm text-zinc-600">
          Descărcați registrul de vânzări lunar în format compatibil SmartBill sau
          SAGA. Sunt incluse doar comenzile livrate (status „Livrate”).
        </p>
      </header>

      {role !== 'OWNER' && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Doar utilizatorii cu rolul <strong>OWNER</strong> pot configura datele
          fiscale și descărca exportul.
        </div>
      )}

      <ExportsClient
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        canEdit={role === 'OWNER'}
        fiscal={fiscal}
        defaultYear={defaultYear}
        defaultMonth={defaultMonth}
      />

      <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-900">Note pentru contabil</h2>
        <ul className="mt-3 space-y-2">
          <li>
            <strong>Format:</strong> CSV cu separator punct și virgulă (
            <code className="rounded bg-white px-1 py-0.5 text-xs">;</code>),
            virgulă zecimală, codare UTF-8 cu BOM. Se deschide direct în Excel
            românesc.
          </li>
          <li>
            <strong>TVA:</strong> rata aleasă în setări se aplică inclusiv asupra
            totalului fiecărei comenzi. Pentru produse cu cote diferite în
            aceeași comandă, contabilul poate ajusta liniile la import.
          </li>
          <li>
            <strong>Fără date personale extinse:</strong> exportul nu include
            telefon, email sau adresă, doar nume client. Dacă aveți comenzi
            B2B cu CUI, le puteți adăuga manual în SmartBill după import.
          </li>
          <li>
            <strong>SAGA:</strong> exportul curent este CSV (varianta XML
            <em> &lt;DocumenteIesire&gt;</em> va fi adăugată într-o versiune
            ulterioară).
          </li>
        </ul>
      </section>
    </div>
  );
}
