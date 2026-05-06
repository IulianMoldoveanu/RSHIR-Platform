// Lane HEPY-PRB — OWNER Hepy bot Telegram binding page.
//
// Shows:
//   - Hero explaining what Hepy is + benefits.
//   - Active binding card (if any): @username / since X / "Deconectează" button.
//   - "Conectează Telegram" CTA → mints nonce → returns t.me/<bot>?start=connect_<nonce> URL.
//   - Quick-command reference (/comenzi, /vanzari, /stoc).
//
// OWNER-only; STAFF / FLEET_MANAGER are redirected to the settings landing.
//
// Server component: fetches active binding via service-role and renders;
// the client wrapper only handles the connect/unbind actions.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Bot, MessageCircle, Sparkles, ShieldCheck } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { HepyConnectClient } from './client';

export const dynamic = 'force-dynamic';

type ActiveBinding = {
  id: string;
  telegram_username: string | null;
  bound_at: string;
  last_active_at: string | null;
};

async function loadActiveBinding(tenantId: string, userId: string): Promise<ActiveBinding | null> {
  const admin = createAdminClient();
  // hepy_owner_bindings ships in migration 20260507_009; not in generated
  // types yet — cast through unknown.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data } = await sb
    .from('hepy_owner_bindings')
    .select('id, telegram_username, bound_at, last_active_at')
    .eq('tenant_id', tenantId)
    .eq('owner_user_id', userId)
    .is('unbound_at', null)
    .order('bound_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ActiveBinding | null) ?? null;
}

function formatRoDate(iso: string): string {
  // "07.05.2026, 14:32" — RO-formal short.
  return new Date(iso).toLocaleString('ro-RO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default async function HepySettingsPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id).catch(() => null);
  if (role !== 'OWNER') {
    // STAFF / FLEET_MANAGER do not get to bind. Send back to landing
    // with an explicit owner-only signal.
    redirect('/dashboard/settings?owner_required=hepy');
  }

  const binding = await loadActiveBinding(tenant.id, user.id);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/dashboard/settings" className="text-xs text-zinc-500 hover:text-zinc-900">
          ← Înapoi la Setări
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
          <Bot className="h-5 w-5 text-purple-600" aria-hidden />
          Hepy — asistent Telegram
        </h1>
        <p className="text-sm text-zinc-600">
          Conectați contul dumneavoastră Telegram pentru a primi rapoarte și a întreba liber despre {tenant.name}.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <Sparkles className="mb-2 h-4 w-4 text-purple-600" aria-hidden />
          <h2 className="text-sm font-semibold text-zinc-900">Întrebări în limbaj natural</h2>
          <p className="mt-1 text-xs text-zinc-600">
            <i>„câte comenzi am acum”</i>, <i>„cum a mers ieri”</i>, <i>„top produse săptămâna”</i>.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <MessageCircle className="mb-2 h-4 w-4 text-purple-600" aria-hidden />
          <h2 className="text-sm font-semibold text-zinc-900">Comenzi rapide</h2>
          <p className="mt-1 text-xs text-zinc-600">
            <code>/comenzi</code>, <code>/vanzari</code>, <code>/stoc</code> — răspuns instant.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <ShieldCheck className="mb-2 h-4 w-4 text-purple-600" aria-hidden />
          <h2 className="text-sm font-semibold text-zinc-900">Doar citire</h2>
          <p className="mt-1 text-xs text-zinc-600">
            Hepy nu modifică nimic în acest moment. Nicio comandă nu poate fi anulată din Telegram.
          </p>
        </div>
      </section>

      <HepyConnectClient
        tenantId={tenant.id}
        tenantName={tenant.name}
        binding={
          binding
            ? {
                id: binding.id,
                telegram_username: binding.telegram_username,
                bound_at_label: formatRoDate(binding.bound_at),
                last_active_label: binding.last_active_at ? formatRoDate(binding.last_active_at) : null,
              }
            : null
        }
      />

      <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Cum funcționează</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-zinc-600">
          <li>Apăsați „Conectează Telegram” — generăm un link unic, valid 1 oră.</li>
          <li>Deschideți linkul pe telefon — se deschide chat-ul cu botul Hepy.</li>
          <li>Apăsați butonul <b>Start</b> în Telegram — confirmăm conectarea.</li>
          <li>Întrebați liber sau folosiți <code>/comenzi</code>, <code>/vanzari</code>, <code>/stoc</code>.</li>
        </ol>
        <p className="mt-3 text-xs text-zinc-500">
          Linkul este personal — nu îl partajați. Dacă pierdeți accesul la Telegram, deconectați de aici și generați altul.
        </p>
      </section>
    </div>
  );
}
