// Lane ANAF-EFACTURA — 4-step OWNER-gated wizard.
// Sibling to /dashboard/settings/smartbill (factură către cumpărător) and
// /dashboard/settings/exports (CSV fallback). This page handles the legal
// transmission to ANAF SPV.
//
// No live ANAF call yet — Step 4 hits a placeholder Edge Function that
// returns 501. The full wizard scaffold + Vault wiring is intentionally
// shipped first so OWNERs can begin the long-lead-time tasks (DSC, OAuth
// app registration, Form 084) while the live submission lane lands.

import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { readEfacturaSettings } from '@/lib/efactura';
import { EfacturaClient } from './efactura-client';

export const dynamic = 'force-dynamic';

export default async function EfacturaSettingsPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);

  const admin = createAdminClient();
  const { data: tenantRow } = await admin
    .from('tenants')
    .select('settings, name')
    .eq('id', tenant.id)
    .maybeSingle();
  const ef = readEfacturaSettings(tenantRow?.settings);

  // Probe the vault to tell the UI whether each sensitive piece is on file.
  // We never echo any value back; the indicator is boolean only.
  const sbAdmin = admin as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const [{ data: certProbe }, { data: secretProbe }] = await Promise.all([
    sbAdmin.rpc('hir_read_vault_secret', {
      secret_name: `efactura_cert_p12_${tenant.id}`,
    }),
    sbAdmin.rpc('hir_read_vault_secret', {
      secret_name: `efactura_oauth_client_secret_${tenant.id}`,
    }),
  ]);
  const hasCert = typeof certProbe === 'string' && certProbe.length > 0;
  const hasOauthSecret =
    typeof secretProbe === 'string' && secretProbe.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          ANAF e-Factura — transmitere SPV
        </h1>
        <p className="max-w-3xl text-sm text-zinc-600">
          Configurați conectarea contului dumneavoastră ANAF pentru ca HIR să
          transmită automat fiecare factură emisă către SPV (Spațiul Privat
          Virtual). Pentru emiterea facturii în SmartBill, configurați{' '}
          <a
            href="/dashboard/settings/smartbill"
            className="font-medium text-purple-700 hover:underline"
          >
            integrarea SmartBill
          </a>
          ; cele două integrări sunt complementare.
        </p>
      </header>

      {role !== 'OWNER' && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Doar utilizatorii cu rolul <strong>OWNER</strong> pot configura
          conectarea ANAF e-Factura.
        </div>
      )}

      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-medium">Etapă pregătitoare</p>
        <p className="mt-1 text-xs">
          Această configurare necesită un certificat digital calificat (DSC)
          activ și un cont SPV operațional. Înainte de a continua, asigurați-vă
          că ați obținut DSC (DigiSign, AlfaSign sau certSIGN) și că aveți
          certificatul exportat în format <code>.p12</code>. Pașii sunt
          reversibili — puteți reveni oricând pentru a actualiza datele.
        </p>
      </div>

      <EfacturaClient
        tenantId={tenant.id}
        canEdit={role === 'OWNER'}
        settings={ef}
        hasCert={hasCert}
        hasOauthSecret={hasOauthSecret}
      />

      <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-900">
          De ce este nevoie de ANAF e-Factura
        </h2>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>
            <strong>B2B obligatoriu</strong> din 1 iulie 2024 și{' '}
            <strong>B2C obligatoriu</strong> din 1 ianuarie 2025 — orice
            factură emisă trebuie transmisă în SPV în maxim 5 zile calendaristice.
          </li>
          <li>
            <strong>Fără configurare ANAF</strong>, restaurantul rămâne
            responsabil pentru transmiterea manuală a fiecărei facturi din
            interfața SPV (operațiune care durează 2–3 minute pe factură).
          </li>
          <li>
            După configurare, HIR transmite automat factura la momentul
            livrării. Costul ANAF este zero — singurul cost recurent este
            certificatul digital (~155–172 RON/an).
          </li>
        </ul>
        <p className="mt-3 text-xs text-zinc-500">
          Toate datele sensibile (certificat, parolă, secret OAuth) sunt
          stocate criptat în Supabase Vault. HIR nu le afișează niciodată
          după salvare; pentru rotație, încărcați varianta nouă peste cea veche.
        </p>
      </section>
    </div>
  );
}
