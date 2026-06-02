// Hepi Command Center — the unified cross-vertical AI cockpit. Platform-admin
// only (Iulian). Renders the chat surface that talks to POST /api/admin/hepi,
// which reads the shared courier spine (restaurant + pharma) read-only and
// explains the whole delivery network. Dark Command Center aesthetic, matching
// /dashboard/admin/hub.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { getHepiMode } from '@/lib/hepi/autonomy';
import { HepiCommandCenterClient } from './client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Hepi — Command Center',
  robots: 'noindex,nofollow',
};

export default async function HepiCommandCenterPage() {
  const supa = await createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user?.email) redirect('/login?next=/dashboard/admin/hepi');

  if (!isPlatformAdminEmail(user.email)) {
    return (
      <main className="min-h-screen bg-zinc-50 p-10">
        <div className="mx-auto max-w-2xl rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Acces interzis: Hepi Command Center este rezervat administratorului platformei HIR.
        </div>
      </main>
    );
  }

  const mode = await getHepiMode();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/60 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span
              aria-hidden
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xs font-bold text-white shadow-md shadow-violet-600/40"
            >
              H
            </span>
            <span className="font-display text-base font-bold">Hepi</span>
            <span className="text-xs text-slate-500">copilot de rețea · cross-vertical</span>
          </div>
          <Link href="/dashboard/admin/hub" className="text-sm text-slate-400 hover:text-slate-200">
            ← Command Center
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 pt-8 pb-4">
        <h1 className="font-display text-2xl font-bold">Întreabă-l pe Hepi orice despre rețea.</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Orchestratorul tău executiv peste toată infrastructura de livrare — restaurante și
          farmacii în același bazin de curieri. Vede comenzile, flotele, curierii, orașele și
          verificările, <span className="text-slate-300">și poate acționa</span>: activează orașe,
          suspendă vendori și altele. Implicit cere confirmare înainte de orice — comuți pe acțiune
          directă când vrei.
        </p>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-12">
        <HepiCommandCenterClient initialMode={mode} />
      </section>
    </main>
  );
}
