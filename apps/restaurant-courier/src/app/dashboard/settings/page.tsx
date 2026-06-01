import Link from 'next/link';
import {
  Bell,
  CalendarClock,
  Car,
  ChevronRight,
  Info,
  LifeBuoy,
  LogOut,
  Smartphone,
  Trash2,
  User,
} from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logoutAction } from '../actions';
import { SettingsRow } from '@/components/settings-row';

export const dynamic = 'force-dynamic';

type ProfileRow = {
  full_name: string | null;
  status: 'INACTIVE' | 'ACTIVE' | 'SUSPENDED';
  avatar_url: string | null;
};

const STATUS = {
  ACTIVE: { label: 'Activ', dot: 'bg-emerald-400' },
  INACTIVE: { label: 'Inactiv', dot: 'bg-hir-muted-fg' },
  SUSPENDED: { label: 'Suspendat', dot: 'bg-amber-400' },
} as const;

export default async function SettingsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from('courier_profiles')
    .select('full_name, status, avatar_url')
    .eq('user_id', user.id)
    .maybeSingle();
  const profile = data as ProfileRow | null;
  const status = STATUS[profile?.status ?? 'INACTIVE'];
  const name = profile?.full_name ?? user.email ?? 'Curier HIR';

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3">
      {/* ── Profile header (tap → Profil & vehicul) ─────────────── */}
      <Link
        href="/dashboard/settings/profile"
        className="group mb-2 flex items-center gap-4 rounded-2xl border border-hir-border bg-hir-surface px-5 py-4 transition-all hover:-translate-y-px hover:border-violet-500/40 hover:shadow-md hover:shadow-violet-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
      >
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt={name}
            className="h-14 w-14 flex-none rounded-full object-cover ring-1 ring-hir-border"
          />
        ) : (
          <span className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-violet-500/15 ring-1 ring-violet-500/30">
            <User className="h-6 w-6 text-violet-300" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-hir-fg">{name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-hir-muted-fg">
            <span className={`h-2 w-2 rounded-full ${status.dot}`} aria-hidden />
            {status.label}
          </p>
        </div>
        <ChevronRight
          className="h-5 w-5 shrink-0 text-hir-muted-fg transition-transform group-hover:translate-x-0.5 group-hover:text-violet-300"
          aria-hidden
        />
      </Link>

      {/* ── Gateways ─────────────────────────────────────────────── */}
      <SettingsRow
        href="/dashboard/settings/profile"
        icon={<Car className="h-5 w-5 text-violet-400" aria-hidden />}
        label="Profil & vehicul"
        description="Date personale, vehicul, verificare identitate"
      />
      <SettingsRow
        href="/dashboard/settings/notifications"
        icon={<Bell className="h-5 w-5 text-violet-400" aria-hidden />}
        label="Notificări"
        description="Comenzi, mesaje, urgențe, anunțuri"
      />
      <SettingsRow
        href="/dashboard/settings/activitate"
        icon={<CalendarClock className="h-5 w-5 text-violet-400" aria-hidden />}
        label="Program & curse"
        description="Ture, istoricul curselor, fotografii livrări"
      />
      <SettingsRow
        href="/dashboard/support"
        icon={<LifeBuoy className="h-5 w-5 text-violet-400" aria-hidden />}
        label="Suport & ajutor"
        description="Chat cu un operator, întrebări frecvente"
      />
      <SettingsRow
        href="/dashboard/settings/aplicatie"
        icon={<Smartphone className="h-5 w-5 text-violet-400" aria-hidden />}
        label="Aplicație"
        description="Temă, tutorial, diagnostic dispozitiv"
      />
      <SettingsRow
        href="/dashboard/about"
        icon={<Info className="h-5 w-5 text-violet-400" aria-hidden />}
        label="Despre HIR Curier"
        description="Versiune, termeni, confidențialitate, ANPC"
      />

      {/* ── Account actions ──────────────────────────────────────── */}
      <form action={logoutAction} className="mt-3">
        <button
          type="submit"
          className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl border border-hir-border bg-hir-surface px-5 py-4 text-left transition-colors hover:border-rose-500/40 hover:bg-rose-500/5 active:scale-[0.99]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500/10">
            <LogOut className="h-5 w-5 text-rose-400" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-rose-400">Deconectare</span>
            <span className="mt-0.5 block truncate text-xs text-hir-muted-fg">{user.email}</span>
          </span>
        </button>
      </form>

      <Link
        href="/settings/delete-account"
        className="px-2 py-3 text-center text-xs text-hir-muted-fg underline-offset-2 transition-colors hover:text-rose-400 hover:underline"
      >
        Șterge contul
      </Link>
    </div>
  );
}
