import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MessageSquare, Phone, Wrench } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cardClasses } from '@/components/card';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Mesaje — HIR Curier',
};

/**
 * Dispatcher messages — skeleton placeholder until the chat schema lands.
 *
 * The bottom-nav points here. Until the courier_messages table + realtime
 * channel are in place, this page surfaces the same "contact dispecer"
 * affordance the help drawer offers so the nav link is never a dead end —
 * but now with the courier's actual fleet dispatcher number pre-filled,
 * not just a generic support hint.
 *
 * When the schema lands, this page becomes the real chat view at the
 * same route.
 */
export default async function MessagesPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profileData } = await admin
    .from('courier_profiles')
    .select('fleet_id')
    .eq('user_id', user.id)
    .maybeSingle();
  const fleetId =
    (profileData as { fleet_id: string | null } | null)?.fleet_id ?? null;

  let dispatcherPhone: string | null = null;
  let fleetName: string | null = null;
  if (fleetId) {
    const { data: fleetData } = await admin
      .from('courier_fleets')
      .select('name, contact_phone')
      .eq('id', fleetId)
      .maybeSingle();
    const row = fleetData as {
      name: string | null;
      contact_phone: string | null;
    } | null;
    dispatcherPhone = row?.contact_phone ?? null;
    fleetName = row?.name ?? null;
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold text-hir-fg">
          <MessageSquare className="h-5 w-5 text-violet-400" aria-hidden />
          Mesaje
        </h1>
        <p className="mt-1 text-sm text-hir-muted-fg">
          Chat-ul cu dispecerul vine în curând. Până atunci, ține legătura
          direct la telefon — răspunsurile vin mai repede în trafic.
        </p>
      </header>

      <section
        aria-label="Status caracteristică"
        className="flex items-start gap-3 rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4 text-xs text-violet-100"
      >
        <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" aria-hidden />
        <p>
          Lucrăm la un chat dispecer↔curier integrat în aplicație. Aici vei
          vedea conversațiile, fără să mai treci pe WhatsApp.
        </p>
      </section>

      {dispatcherPhone ? (
        <a
          href={`tel:${dispatcherPhone.replace(/\s+/g, '')}`}
          className={cardClasses({ className: 'flex items-center gap-3 transition-colors hover:border-violet-500/40 hover:bg-hir-border/40 active:scale-[0.99]' })}
        >
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15"
          >
            <Phone className="h-5 w-5 text-emerald-400" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-hir-fg">
              Sună dispecerul {fleetName ? `(${fleetName})` : ''}
            </p>
            <p className="mt-0.5 truncate text-xs text-hir-muted-fg">
              {dispatcherPhone}
            </p>
          </div>
        </a>
      ) : (
        <a
          href="tel:+40213000000"
          className={cardClasses({ className: 'flex items-center gap-3 transition-colors hover:border-violet-500/40 hover:bg-hir-border/40 active:scale-[0.99]' })}
        >
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15"
          >
            <Phone className="h-5 w-5 text-emerald-400" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-hir-fg">Sună suportul HIR</p>
            <p className="mt-0.5 truncate text-xs text-hir-muted-fg">
              021 300 0000 · L–V 09–18
            </p>
          </div>
        </a>
      )}

      <p className="text-[11px] text-hir-muted-fg">
        Pentru urgențe operaționale (vendor nu răspunde, client absent),
        sună direct dispecerul flotei tale. Suportul HIR e pentru probleme
        de cont sau aplicație.
      </p>

      <Link
        href="/dashboard/help"
        className="self-start rounded-lg px-3 py-2 text-xs font-medium text-violet-300 hover:bg-violet-500/10 hover:text-violet-200"
      >
        Vezi întrebări frecvente →
      </Link>
    </div>
  );
}
