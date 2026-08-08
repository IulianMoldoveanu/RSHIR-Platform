// B2B Marketplace — vendor "new listing" form.
//
// Strategy Master Plan Section 5 (B2B Marketplace), Stream 5/9 (UI vendor side).
// Builds a payload that satisfies the marketplace-listing-create edge fn
// contract (see supabase/functions/marketplace-listing-create/index.ts):
// vendor_tenant_id + vertical + ISO window + pickup/dropoff JSON + package
// metadata. Dropoff address is restricted to delivery-zone fields only — full
// customer PII goes through customer_phone_redacted (anti-disintermediation
// pillar 5 / GDPR).
//
// Feature flag: HIR_FEATURE_MARKETPLACE_ENABLED gates the page via notFound()
// in the server component below. The form itself is a client component so
// useFormState can surface action errors inline.

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClientUntyped } from '@/lib/supabase/admin';
import { listActiveCities, type CityRow } from '@/lib/cities';
import { NewListingForm, type TenantOption } from './new-listing-form';
import {
  PageHeader,
  Icon,
  EmptyMarketplaceState,
  ErrorState,
} from '@/app/marketplace/_components/ui';

export const dynamic = 'force-dynamic';

const BACK_LINK = (
  <Link href="/marketplace/listings" className="inline-flex items-center gap-1 hover:underline">
    <Icon name="arrow-left" className="h-3.5 w-3.5" />
    Înapoi la cereri
  </Link>
);

const HEADER_DESCRIPTION =
  'Cererea devine vizibilă pentru flotele HIR. Vei putea accepta oferta câștigătoare.';

export default async function NewListingPage(): Promise<JSX.Element> {
  if (process.env.HIR_FEATURE_MARKETPLACE_ENABLED !== 'true') notFound();

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClientUntyped();
  const { data: memberships, error: memberErr } = await admin
    .from('tenant_members')
    .select('tenant_id, tenants:tenants(id, name)')
    .eq('user_id', user.id);

  if (memberErr) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <PageHeader
          variant="hero"
          eyebrow="HIR · MARKETPLACE"
          title="Publică o cerere nouă"
          description={HEADER_DESCRIPTION}
          breadcrumb={BACK_LINK}
        />
        <div className="mt-6">
          <ErrorState description="Nu am putut încărca restaurantele. Reîncarcă pagina sau revino mai târziu." />
        </div>
      </main>
    );
  }

  const tenants: TenantOption[] = (memberships ?? [])
    .map((m: { tenants: { id: string; name: string } | null }) => m.tenants)
    .filter((t: { id: string; name: string } | null): t is { id: string; name: string } =>
      Boolean(t && typeof t.id === 'string' && t.id.length > 0),
    )
    .map((t: { id: string; name: string }) => ({ id: t.id, name: t.name }));

  const cities: CityRow[] = await listActiveCities();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <PageHeader
        variant="hero"
        eyebrow="HIR · MARKETPLACE"
        title="Publică o cerere nouă"
        description={HEADER_DESCRIPTION}
        breadcrumb={BACK_LINK}
      />

      {tenants.length === 0 ? (
        <div className="mt-6">
          <EmptyMarketplaceState
            title="Niciun restaurant asociat"
            description="Nu ești asociat niciunui restaurant. Contactează administratorul HIR pentru acces."
          />
        </div>
      ) : (
        <NewListingForm tenants={tenants} cities={cities} />
      )}
    </main>
  );
}
