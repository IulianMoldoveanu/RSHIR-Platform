// Self-serve payments setup page for restaurant OWNERs.
// Stripe Connect requires platform-level setup (HIR holds the platform account),
// so owners cannot self-configure directly. This page collects intent + business
// details and queues them in stripe_onboarding_requests for the platform team.

import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { PaymentsClient } from './payments-client';

export const dynamic = 'force-dynamic';

type RequestRow = {
  id: string;
  business_name: string;
  vat_number: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  notes: string | null;
  created_at: string;
};

export default async function PaymentsSettingsPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);

  const admin = createAdminClient();

  // Read tenant.settings to detect any platform-admin-configured online gateway.
  const { data: tenantRow } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', tenant.id)
    .maybeSingle();
  const settings = (tenantRow?.settings as Record<string, unknown> | null) ?? {};
  const payments = (settings.payments as Record<string, unknown> | undefined) ?? {};
  const stripeStatus =
    typeof payments.stripe_connect_status === 'string'
      ? (payments.stripe_connect_status as string)
      : null;
  const netopiaActive = payments.netopia_active === true;
  const stripeActive = payments.stripe_active === true || stripeStatus === 'ACTIVE';

  // Latest onboarding request (if any). Cast through unknown — the table is
  // freshly added and not in generated Database types yet.
  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => {
              maybeSingle: () => Promise<{
                data: RequestRow | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
  };
  const { data: latestRequest } = await sb
    .from('stripe_onboarding_requests')
    .select('id, business_name, vat_number, status, notes, created_at')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Plăți și facturare
        </h1>
        <p className="text-sm text-zinc-600">
          Configurați metodele de plată acceptate pentru {tenant.name}. Plata cash la
          livrare este activă implicit; plățile online se activează prin echipa HIR.
        </p>
      </header>

      {role !== 'OWNER' && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Doar utilizatorii cu rolul <strong>OWNER</strong> pot solicita activarea
          plăților online.
        </div>
      )}

      {/* Current methods — read-only */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Metode de plată active</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Stare curentă a metodelor disponibile pe storefront-ul dumneavoastră.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MethodCard
            label="Plată la livrare"
            status="Activă"
            tone="emerald"
            description="Disponibilă implicit pentru toate comenzile cu livrare."
          />
          <MethodCard
            label="Card online (Stripe)"
            status={stripeActive ? 'Activ' : 'Inactiv'}
            tone={stripeActive ? 'emerald' : 'zinc'}
            description="Carduri internaționale (Visa, Mastercard, Apple Pay, Google Pay)."
          />
          <MethodCard
            label="Card online (Netopia)"
            status={netopiaActive ? 'Activ' : 'Inactiv'}
            tone={netopiaActive ? 'emerald' : 'zinc'}
            description="Carduri emise în România. Configurați prin /dashboard/settings/payments/netopia."
          />
        </div>
      </section>

      {/* Cash / delivery fee info */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">
          Plată cash și comisioane HIR
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-zinc-700">
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
            <span>
              <strong>Plată la livrare:</strong> activă, fără configurare suplimentară.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-purple-500" />
            <span>
              <strong>Comision HIR — Tier 1:</strong> 3 RON per livrare efectuată
              (fix, indiferent de valoarea comenzii).
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-purple-500" />
            <span>
              <strong>Comision HIR — Tier 2:</strong> cost curier la pass-through
              + 3 RON taxă HIR.
            </span>
          </li>
        </ul>
      </section>

      {/* Stripe Connect request */}
      <PaymentsClient
        tenantId={tenant.id}
        canEdit={role === 'OWNER'}
        latestRequest={latestRequest}
        defaultBusinessName={tenant.name}
      />

      {/* Multi-gateway note */}
      <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
        <h2 className="text-sm font-semibold text-zinc-900">
          Despre gateway-urile suportate
        </h2>
        <p className="mt-2 text-sm text-zinc-700">
          HIR suportă <strong>Stripe</strong> (carduri internaționale),{' '}
          <strong>Netopia</strong> (carduri RO) și plata cash. Selectarea
          gateway-urilor active se face în colaborare cu echipa HIR — ne scrieți
          la{' '}
          <a
            href="mailto:contact@hiraisolutions.ro"
            className="font-medium text-purple-700 underline-offset-2 hover:underline"
          >
            contact@hiraisolutions.ro
          </a>{' '}
          sau folosiți butonul de feedback din colțul ecranului.
        </p>
      </section>
    </div>
  );
}

function MethodCard({
  label,
  status,
  tone,
  description,
}: {
  label: string;
  status: string;
  tone: 'emerald' | 'zinc';
  description: string;
}) {
  const badgeClasses =
    tone === 'emerald'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-zinc-100 text-zinc-600 border-zinc-200';
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-zinc-900">{label}</span>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClasses}`}
        >
          {status}
        </span>
      </div>
      <p className="mt-2 text-xs text-zinc-600">{description}</p>
    </div>
  );
}
