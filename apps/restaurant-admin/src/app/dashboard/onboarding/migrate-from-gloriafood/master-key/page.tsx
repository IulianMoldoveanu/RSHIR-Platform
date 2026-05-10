// Master Key importer — direct API path, alternative to CSV upload.
// User pastes their GloriaFood Master Key, we fetch + preview, then they
// confirm and we run the same commitGloriaFoodImport that powers CSV.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTenant } from '@/lib/tenant';
import { MasterKeyClient } from './client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function MasterKeyImportPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/onboarding/migrate-from-gloriafood/master-key');

  const { tenant } = await getActiveTenant();

  return (
    <main className="min-h-screen bg-[#FAFAFA] text-[#0F172A]" style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-8">
          <div className="text-xs font-medium uppercase tracking-wide text-[#475569]">
            Onboarding · Migrare din GloriaFood
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Importă meniu via Master Key</h1>
          <p className="mt-2 text-sm text-[#475569]">
            Mai rapid decât CSV-ul. Cheia se găsește în GloriaFood Admin → <em>Setup → Master Key</em>.
            Cheia rămâne pe serverul HIR doar pentru durata importului — nu o stocăm.
          </p>
        </header>

        <MasterKeyClient tenantId={tenant.id} tenantName={tenant.name} />

        <div className="mt-10 border-t border-[#E2E8F0] pt-6">
          <h2 className="text-sm font-semibold">Preferi CSV?</h2>
          <p className="mt-1 text-xs text-[#94a3b8]">
            <a href="/dashboard/onboarding/migrate-from-gloriafood" className="text-[#4F46E5] underline">
              Folosește varianta cu fișier
            </a>{' '}
            dacă nu ai acces la Master Key.
          </p>
        </div>
      </div>
    </main>
  );
}
