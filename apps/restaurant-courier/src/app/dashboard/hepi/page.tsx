// Hepi Curier — AI co-pilot chat for couriers.

import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { HepiCurierClient } from './client';

export const dynamic = 'force-dynamic';

export default async function HepiCurierPage() {
  const supa = await createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/hepi');

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow"
          >
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-hir-fg">Hepi Curier</h1>
            <p className="text-xs text-hir-muted">
              Co-pilotul tău AI. Întreabă orice despre rute, comenzi, câștiguri.
            </p>
          </div>
        </div>
      </header>

      <HepiCurierClient />
    </div>
  );
}
