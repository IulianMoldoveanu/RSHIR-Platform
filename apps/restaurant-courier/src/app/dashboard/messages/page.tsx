import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, MessageSquare, Phone, Wrench } from 'lucide-react';
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
 * but with the courier's actual fleet dispatcher number pre-filled, not
 * a generic support hint.
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

  const hasDispatcher = !!dispatcherPhone;
  const phoneHref = hasDispatcher
    ? `tel:${dispatcherPhone!.replace(/\s+/g, '')}`
    : 'tel:+40213000000';
  const phoneLabel = hasDispatcher
    ? `Sună dispecerul${fleetName ? ` · ${fleetName}` : ''}`
    : 'Sună suportul HIR';
  const phoneText = hasDispatcher ? dispatcherPhone! : '021 300 0000 · L–V 09–18';

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <header className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-500/30 shadow-md shadow-violet-500/15">
          <MessageSquare className="h-5 w-5 text-violet-300" aria-hidden strokeWidth={2.25} />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-hir-fg">Mesaje</h1>
          <p className="mt-0.5 text-sm leading-relaxed text-hir-muted-fg">
            Chat-ul cu dispecerul vine în curând. Până atunci, ține legătura
            direct la telefon — răspunsurile vin mai repede în trafic.
          </p>
        </div>
      </header>

      <section
        aria-label="Status caracteristică"
        className="flex items-start gap-3 rounded-2xl border border-violet-500/40 bg-violet-500/10 p-4 ring-1 ring-inset ring-violet-500/15"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/20 ring-1 ring-violet-500/40">
          <Wrench className="h-4 w-4 text-violet-200" aria-hidden strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-300">
            În curând
          </p>
          <p className="text-sm leading-relaxed text-violet-100">
            Lucrăm la un chat dispecer↔curier integrat în aplicație. Aici vei
            vedea conversațiile, fără să mai treci pe WhatsApp.
          </p>
        </div>
      </section>

      <a
        href={phoneHref}
        className="group flex min-h-[64px] items-center gap-3 rounded-2xl border border-hir-border bg-hir-surface px-4 py-3 transition-all hover:-translate-y-px hover:border-emerald-500/40 hover:bg-emerald-500/5 hover:shadow-md hover:shadow-emerald-500/10 active:translate-y-0 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-emerald-500 focus-visible:outline-offset-2"
      >
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30 shadow-sm shadow-emerald-500/15"
        >
          <Phone className="h-5 w-5 text-emerald-300" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-hir-fg">{phoneLabel}</p>
          <p className="mt-0.5 truncate text-xs tabular-nums text-hir-muted-fg">
            {phoneText}
          </p>
        </div>
        <ArrowRight
          className="h-4 w-4 shrink-0 text-hir-muted-fg transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-300"
          aria-hidden
          strokeWidth={2.25}
        />
      </a>

      <p className="text-[11px] leading-relaxed text-hir-muted-fg">
        Pentru urgențe operaționale (vendor nu răspunde, client absent),
        sună direct dispecerul flotei tale. Suportul HIR e pentru probleme
        de cont sau aplicație.
      </p>

      <Link
        href="/dashboard/help"
        className="group inline-flex min-h-[44px] items-center gap-1.5 self-start rounded-lg px-3 text-xs font-medium text-violet-300 transition-colors hover:bg-violet-500/10 hover:text-violet-200 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
      >
        Vezi întrebări frecvente
        <ArrowRight
          className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
          aria-hidden
          strokeWidth={2.25}
        />
      </Link>
    </div>
  );
}
