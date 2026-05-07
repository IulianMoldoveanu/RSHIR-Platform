// Lane WHATSAPP-BUSINESS-API-SKELETON — OWNER WhatsApp Business binding
// page. Mirror of /dashboard/settings/hepy. Skeleton — full intent
// surface (analytics, ops, reservations) lands in Sprint 15+.
//
// Renders:
//   - Hero explaining what WhatsApp brings (parallel channel to Telegram).
//   - Active binding card (if any): masked phone / since X / "Deconectează".
//   - "Generează link" CTA → mints nonce → wa.me link.
//   - Onboarding state when biz phone not yet configured (Meta approval pending).
//   - Cost note: 1k free conversations/mo, then ~$0.005-0.01/conv RO.
//   - Quick-command reference (ajutor / comenzi / vânzări).
//
// OWNER-only; STAFF / FLEET_MANAGER are redirected to the settings landing.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MessageSquare, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { WhatsAppConnectClient } from './client';

export const dynamic = 'force-dynamic';

type ActiveBinding = {
  id: string;
  wa_phone_number: string;
  wa_display_name: string | null;
  bound_at: string;
  last_active_at: string | null;
};

async function loadActiveBinding(tenantId: string, userId: string): Promise<ActiveBinding | null> {
  const admin = createAdminClient();
  // whatsapp_owner_bindings ships in migration 20260608_003.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data } = await sb
    .from('whatsapp_owner_bindings')
    .select('id, wa_phone_number, wa_display_name, bound_at, last_active_at')
    .eq('tenant_id', tenantId)
    .eq('owner_user_id', userId)
    .is('unbound_at', null)
    .order('bound_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ActiveBinding | null) ?? null;
}

function formatRoDate(iso: string): string {
  return new Date(iso).toLocaleString('ro-RO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// "+40712345678" → "+40 712 ••• •78" — only show first 3 + last 2 digits.
function maskPhone(e164: string): string {
  const trimmed = e164.startsWith('+') ? e164 : `+${e164}`;
  if (trimmed.length < 7) return trimmed;
  const head = trimmed.slice(0, 6);
  const tail = trimmed.slice(-2);
  return `${head} ••• ${tail}`;
}

function bizPhoneConfigured(): boolean {
  const v = process.env.NEXT_PUBLIC_HIR_WHATSAPP_BIZ_PHONE;
  if (!v) return false;
  return v.replace(/[^0-9]/g, '').length >= 8;
}

export default async function WhatsAppSettingsPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id).catch(() => null);
  if (role !== 'OWNER') {
    redirect('/dashboard/settings?owner_required=whatsapp');
  }

  const binding = await loadActiveBinding(tenant.id, user.id);
  const bizConfigured = bizPhoneConfigured();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/dashboard/settings" className="text-xs text-zinc-500 hover:text-zinc-900">
          ← Înapoi la Setări
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
          <MessageSquare className="h-5 w-5 text-emerald-600" aria-hidden />
          WhatsApp — asistent Hepy
        </h1>
        <p className="text-sm text-zinc-600">
          Conectați numărul dumneavoastră de WhatsApp pentru a primi rapoarte și a întreba despre {tenant.name}, paralel cu Telegram.
        </p>
      </header>

      {!bizConfigured && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">Configurare în curs</h2>
          <p className="mt-1 text-xs text-amber-800">
            Aprobarea Meta WhatsApp Business este în desfășurare (~3-7 zile lucrătoare). Această pagină devine activă imediat după.
          </p>
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <Sparkles className="mb-2 h-4 w-4 text-emerald-600" aria-hidden />
          <h2 className="text-sm font-semibold text-zinc-900">Mesaje în limbaj natural</h2>
          <p className="mt-1 text-xs text-zinc-600">
            <i>„câte comenzi am acum”</i>, <i>„vânzări azi”</i>, <i>„ajutor”</i>.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <Wallet className="mb-2 h-4 w-4 text-emerald-600" aria-hidden />
          <h2 className="text-sm font-semibold text-zinc-900">Cost minim</h2>
          <p className="mt-1 text-xs text-zinc-600">
            Primele 1.000 conversații/lună sunt gratuite. Apoi ~0,02 RON/conversație.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <ShieldCheck className="mb-2 h-4 w-4 text-emerald-600" aria-hidden />
          <h2 className="text-sm font-semibold text-zinc-900">Doar citire</h2>
          <p className="mt-1 text-xs text-zinc-600">
            Hepy WhatsApp nu modifică nimic momentan. Comenzile rapide răspund în secunde.
          </p>
        </div>
      </section>

      <WhatsAppConnectClient
        tenantId={tenant.id}
        tenantName={tenant.name}
        bizConfigured={bizConfigured}
        binding={
          binding
            ? {
                id: binding.id,
                wa_phone_masked: maskPhone(binding.wa_phone_number),
                wa_display_name: binding.wa_display_name,
                bound_at_label: formatRoDate(binding.bound_at),
                last_active_label: binding.last_active_at ? formatRoDate(binding.last_active_at) : null,
              }
            : null
        }
      />

      <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Cum funcționează</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-zinc-600">
          <li>Apăsați „Generează link” — primiți un link unic, valid 1 oră.</li>
          <li>Deschideți linkul de pe telefonul cu WhatsApp instalat.</li>
          <li>Apăsați <b>Trimite</b> — mesajul „connect &lt;cod&gt;” pleacă automat.</li>
          <li>Răspuns instant cu confirmare. Trimiteți „ajutor” pentru lista de comenzi.</li>
        </ol>
        <p className="mt-3 text-xs text-zinc-500">
          Linkul este personal — nu îl partajați. Dacă pierdeți accesul la WhatsApp, deconectați de aici și generați altul.
        </p>
      </section>
    </div>
  );
}
