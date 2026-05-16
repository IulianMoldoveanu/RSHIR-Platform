// Self-serve payments setup page for restaurant OWNERs.
// Stripe Connect requires platform-level setup (HIR holds the platform account),
// so owners cannot self-configure directly. This page collects intent + business
// details and queues them in stripe_onboarding_requests for the platform team.
//
// Lane PSP-MULTIGATES-V1 (2026-05-10): added a multi-gateway status surface
// listing all supported providers (Netopia, Stripe Connect, Viva). The
// existing Stripe Connect request UX is preserved unchanged — Iulian's
// human-gated approval flow stays. Viva is greyed out until commercial
// config arrives.

import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { PaymentsClient } from './payments-client';
import { PaymentModeClient } from './payment-mode-client';
import type { PaymentMode } from './actions';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';

const VALID_PAYMENT_MODES: PaymentMode[] = ['cod_only', 'card_test', 'card_live'];
function readMode(payments: Record<string, unknown>): PaymentMode {
  const m = payments.mode;
  return typeof m === 'string' && VALID_PAYMENT_MODES.includes(m as PaymentMode)
    ? (m as PaymentMode)
    : 'cod_only';
}

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
  // Platform admins may not be members of this tenant (allow-list bypass);
  // still allow them to edit the per-tenant payment mode during onboarding.
  const isPlatformAdmin = isPlatformAdminEmail(user.email);
  const canEditMode = role === 'OWNER' || isPlatformAdmin;

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
  const paymentMode = readMode(payments);

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

      {role !== 'OWNER' && !isPlatformAdmin && (
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

      {/* Per-tenant payment-mode toggle. Drives storefront checkout surface
          before live Netopia/Viva credentials arrive. */}
      <PaymentModeClient
        tenantId={tenant.id}
        canEdit={canEditMode}
        currentMode={paymentMode}
      />

      {/* Gateway picker — multi-PSP status surface (Lane PSP-MULTIGATES-V1) */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">
          Procesatori de plată disponibili
        </h2>
        <p className="mt-1 text-xs text-zinc-600">
          HIR suportă mai mulți procesatori de carduri. Activarea se face în
          colaborare cu echipa HIR pentru fiecare procesator în parte.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <GatewayRow
            name="Netopia"
            description="Carduri emise în România. Procesator local recomandat pentru clientela din RO."
            status={netopiaActive ? 'Activ' : 'Disponibil'}
            tone={netopiaActive ? 'emerald' : 'zinc'}
            actionHref="/dashboard/settings/payments/netopia"
            actionLabel="Configurați"
            disabled={role !== 'OWNER'}
          />
          <GatewayRow
            name="Stripe Connect"
            description="Carduri internaționale (Visa, Mastercard, Apple Pay, Google Pay). Configurare aprobată manual de echipa HIR."
            status={
              stripeActive
                ? 'Activ'
                : stripeStatus === 'PENDING'
                  ? 'În așteptare'
                  : 'Cerere necesară'
            }
            tone={stripeActive ? 'emerald' : stripeStatus === 'PENDING' ? 'amber' : 'zinc'}
            actionHref={null}
            actionLabel={null}
            disabled={role !== 'OWNER'}
          />
          <GatewayRow
            name="Viva Wallet"
            description="Procesator alternativ pentru carduri RO și internaționale. În curs de configurare comercială."
            status="Disponibil în curând"
            tone="zinc"
            actionHref={null}
            actionLabel={null}
            disabled
            comingSoon
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

      {/* Contact note */}
      <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
        <h2 className="text-sm font-semibold text-zinc-900">
          Aveți nevoie de ajutor?
        </h2>
        <p className="mt-2 text-sm text-zinc-700">
          Pentru întrebări despre configurarea procesatorilor sau comisioane,
          ne scrieți la{' '}
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

function GatewayRow({
  name,
  description,
  status,
  tone,
  actionHref,
  actionLabel,
  disabled,
  comingSoon,
}: {
  name: string;
  description: string;
  status: string;
  tone: 'emerald' | 'amber' | 'zinc';
  actionHref: string | null;
  actionLabel: string | null;
  disabled?: boolean;
  comingSoon?: boolean;
}) {
  const badgeClasses =
    tone === 'emerald'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : 'bg-zinc-100 text-zinc-600 border-zinc-200';
  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        comingSoon ? 'border-zinc-200 bg-zinc-50 opacity-70' : 'border-zinc-200 bg-white'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-zinc-900">{name}</span>
          <span
            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClasses}`}
          >
            {status}
          </span>
        </div>
        {actionHref && actionLabel && !disabled && (
          <Link
            href={actionHref}
            className="text-xs font-medium text-purple-700 hover:underline"
          >
            {actionLabel} →
          </Link>
        )}
      </div>
      <p className="mt-1.5 text-xs text-zinc-600">{description}</p>
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
