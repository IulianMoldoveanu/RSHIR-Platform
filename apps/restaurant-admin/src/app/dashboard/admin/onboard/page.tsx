// Platform-admin in-person tenant onboarding wizard.
// Iulian: 4 fields → tenant + OWNER user → switch into it → master-key import
// → branding → go-live. Total time <10 min. See actions.ts for the contract.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { OnboardClient } from './client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PlatformAdminOnboardPage() {
  const supa = await createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/admin/onboard');

  if (!isPlatformAdminEmail(user.email)) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Acces interzis: doar administratorii platformei pot crea tenanți noi.
      </div>
    );
  }

  const primaryDomain = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || 'hiraisolutions.ro';

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Admin · Onboarding rapid
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Tenant nou (in-person)
        </h1>
        <p className="text-sm text-zinc-600">
          Introdu cele 4 detalii ale restaurantului. Creăm contul OWNER cu email
          confirmat (vouchezi în persoană) și o parolă temporară pe care o dai
          patronului. Apoi continui pe acest dispozitiv: import meniu din
          GloriaFood, identitate vizuală, activare comenzi.
        </p>
      </header>

      <OnboardClient primaryDomain={primaryDomain} />
    </div>
  );
}
