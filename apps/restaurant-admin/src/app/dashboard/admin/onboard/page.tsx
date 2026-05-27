// Platform-admin in-person tenant onboarding wizard (3 steps).
// Step 1: restaurant info + slug + type + city + phone
// Step 2: owner email + Telegram Hepi prompt
// Step 3: logo + brand color + tagline + summary → submit
// Gate: HIR_PLATFORM_ADMIN_EMAILS (same as /dashboard/admin/partners).

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { listActiveCities } from '@/lib/cities';
import { OnboardWizard } from './wizard';

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
  const cities = await listActiveCities();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Admin · Onboarding rapid
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Restaurant nou (in-person)
        </h1>
        <p className="max-w-xl text-sm text-zinc-600">
          3 pași simpli — sub 5 minute. La final patronul are cont activ,
          storefrontul e gata și Hepi e pregătit să preia comenzi.
        </p>
      </header>

      <div className="max-w-2xl">
        <OnboardWizard primaryDomain={primaryDomain} cities={cities} />
      </div>
    </div>
  );
}
