import Link from 'next/link';
import {
  Bell,
  CalendarClock,
  CalendarOff,
  Camera,
  ChevronRight,
  ExternalLink,
  FileText,
  HelpCircle,
  LogOut,
  Mail,
  Phone,
  Receipt,
  Shield,
  User,
} from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateAvatarUrlAction, updateVehicleTypeAction, logoutAction } from '../actions';
import { AvatarUpload } from '@/components/avatar-upload';
import { VehicleSelector } from '@/components/vehicle-selector';
import { ThemeToggle } from '@/components/theme-toggle';

export const dynamic = 'force-dynamic';

const APP_VERSION = '0.1.0';

type ProfileRow = {
  full_name: string | null;
  phone: string | null;
  vehicle_type: 'BIKE' | 'SCOOTER' | 'CAR';
  status: 'INACTIVE' | 'ACTIVE' | 'SUSPENDED';
  avatar_url: string | null;
};

const STATUS_LABEL: Record<ProfileRow['status'], { label: string; tone: string }> = {
  ACTIVE: { label: 'Activ', tone: 'bg-emerald-500/10 text-emerald-300' },
  INACTIVE: { label: 'Inactiv', tone: 'bg-hir-border text-hir-muted-fg' },
  SUSPENDED: { label: 'Suspendat', tone: 'bg-amber-500/10 text-amber-300' },
};

export default async function SettingsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from('courier_profiles')
    .select('full_name, phone, vehicle_type, status, avatar_url')
    .eq('user_id', user.id)
    .maybeSingle();
  const profile = data as ProfileRow | null;

  const status = profile?.status ?? 'INACTIVE';
  const statusBadge = STATUS_LABEL[status];

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="text-xl font-bold text-hir-fg">Setări</h1>

      {/* ── Section 1: Profil + vehicul ─────────────────────────── */}
      <section aria-labelledby="section-profil">
        <h2
          id="section-profil"
          className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg"
        >
          Profil &amp; vehicul
        </h2>

        <div className="flex flex-col gap-3">
          {/* Profile card */}
          <div className="rounded-2xl border border-hir-border bg-hir-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-base font-semibold text-hir-fg">Profil</p>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusBadge.tone}`}
              >
                {statusBadge.label}
              </span>
            </div>
            <div className="mb-5">
              <AvatarUpload
                userId={user.id}
                initialUrl={profile?.avatar_url ?? null}
                fullName={profile?.full_name ?? null}
                saveAvatarUrl={updateAvatarUrlAction}
              />
            </div>
            <ul className="divide-y divide-hir-border/60">
              <ProfileRowItem
                icon={<User className="h-4 w-4 text-hir-muted-fg" aria-hidden />}
                label="Nume"
                value={profile?.full_name ?? '—'}
              />
              <ProfileRowItem
                icon={<Mail className="h-4 w-4 text-hir-muted-fg" aria-hidden />}
                label="Email"
                value={user.email ?? '—'}
              />
              <ProfileRowItem
                icon={<Phone className="h-4 w-4 text-hir-muted-fg" aria-hidden />}
                label="Telefon"
                value={profile?.phone ?? '—'}
              />
            </ul>
            <p className="mt-3 text-[11px] text-hir-muted-fg">
              Pentru a modifica numele sau telefonul, contactează suportul.
            </p>
          </div>

          {/* Vehicle picker */}
          <div className="rounded-2xl border border-hir-border bg-hir-surface p-5">
            <p className="mb-1 text-base font-semibold text-hir-fg">Vehicul</p>
            <p className="mb-4 text-[11px] text-hir-muted-fg">
              Selectează vehiculul cu care livrezi astăzi.
            </p>
            <VehicleSelector
              initial={profile?.vehicle_type ?? 'BIKE'}
              onSave={updateVehicleTypeAction}
            />
          </div>
        </div>
      </section>

      {/* ── Section 2: App + dispozitiv ──────────────────────────── */}
      <section aria-labelledby="section-app">
        <h2
          id="section-app"
          className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg"
        >
          App &amp; dispozitiv
        </h2>

        <div className="flex flex-col gap-3">
          {/* Theme toggle */}
          <div className="rounded-2xl border border-hir-border bg-hir-surface p-5">
            <ThemeToggle />
          </div>

          {/* Notification preferences */}
          <Link
            href="/dashboard/settings/notifications"
            className="flex items-center gap-3 rounded-2xl border border-hir-border bg-hir-surface px-5 py-4 hover:border-violet-500/40 hover:bg-hir-border/60 active:scale-[0.99]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/10">
              <Bell className="h-5 w-5 text-violet-400" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-hir-fg">Notificări</p>
              <p className="mt-0.5 text-xs text-hir-muted-fg">Comenzi, mesaje, urgențe, anunțuri</p>
            </div>
            <ChevronRight className="h-4 w-4 text-hir-muted-fg" aria-hidden />
          </Link>
        </div>
      </section>

      {/* ── Section 3: Cont + ajutor ─────────────────────────────── */}
      <section aria-labelledby="section-cont">
        <h2
          id="section-cont"
          className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg"
        >
          Cont &amp; ajutor
        </h2>

        <div className="flex flex-col gap-3">
          {/* Photo proof archive */}
          <Link
            href="/dashboard/proofs"
            className="flex items-center gap-3 rounded-2xl border border-hir-border bg-hir-surface px-5 py-4 hover:border-violet-500/40 hover:bg-hir-border/60 active:scale-[0.99]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/10">
              <Camera className="h-5 w-5 text-violet-400" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-hir-fg">Fotografii livrări</p>
              <p className="mt-0.5 text-xs text-hir-muted-fg">Arhivă dovezi livrare, ultimele 30 zile</p>
            </div>
            <ChevronRight className="h-4 w-4 text-hir-muted-fg" aria-hidden />
          </Link>

          {/* Schedule reservation */}
          <Link
            href="/dashboard/schedule"
            className="flex items-center gap-3 rounded-2xl border border-hir-border bg-hir-surface px-5 py-4 hover:border-violet-500/40 hover:bg-hir-border/60 active:scale-[0.99]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/10">
              <CalendarClock className="h-5 w-5 text-violet-400" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-hir-fg">Program săptămânal</p>
              <p className="mt-0.5 text-xs text-hir-muted-fg">Rezervă ture pentru 7 zile înainte</p>
            </div>
            <ChevronRight className="h-4 w-4 text-hir-muted-fg" aria-hidden />
          </Link>

          {/* Time-off request */}
          <Link
            href="/dashboard/time-off"
            className="flex items-center gap-3 rounded-2xl border border-hir-border bg-hir-surface px-5 py-4 hover:border-violet-500/40 hover:bg-hir-border/60 active:scale-[0.99]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/10">
              <CalendarOff className="h-5 w-5 text-violet-400" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-hir-fg">Cerere zile libere</p>
              <p className="mt-0.5 text-xs text-hir-muted-fg">Concediu medical, vacanță, cauze personale</p>
            </div>
            <ChevronRight className="h-4 w-4 text-hir-muted-fg" aria-hidden />
          </Link>

          {/* Help & FAQ */}
          <Link
            href="/dashboard/help"
            className="flex items-center gap-3 rounded-2xl border border-hir-border bg-hir-surface px-5 py-4 hover:border-violet-500/40 hover:bg-hir-border/60 active:scale-[0.99]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/10">
              <HelpCircle className="h-5 w-5 text-violet-400" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-hir-fg">Ajutor &amp; FAQ</p>
              <p className="mt-0.5 text-xs text-hir-muted-fg">Plată, fotografii, urgențe</p>
            </div>
            <ChevronRight className="h-4 w-4 text-hir-muted-fg" aria-hidden />
          </Link>

          {/* Tax export placeholder — #477 */}
          <div className="flex items-center gap-3 rounded-2xl border border-hir-border bg-hir-surface px-5 py-4 opacity-50">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-hir-border">
              <Receipt className="h-5 w-5 text-hir-muted-fg" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-hir-fg">Export fiscal</p>
              <p className="mt-0.5 text-xs text-hir-muted-fg">Disponibil în curând</p>
            </div>
          </div>

          {/* Logout */}
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl border border-hir-border bg-hir-surface px-5 py-4 text-left hover:border-rose-500/40 hover:bg-rose-500/5 active:scale-[0.99]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500/10">
                <LogOut className="h-5 w-5 text-rose-400" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-rose-400">Deconectare</p>
                <p className="mt-0.5 text-xs text-hir-muted-fg">{user.email}</p>
              </div>
            </button>
          </form>
        </div>
      </section>

      {/* ── Section 4: Despre + Legal ─────────────────────────────── */}
      <section aria-labelledby="section-despre">
        <h2
          id="section-despre"
          className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg"
        >
          Despre &amp; legal
        </h2>

        <div className="rounded-2xl border border-hir-border bg-hir-surface p-5">
          <p className="mb-4 text-xs font-semibold text-hir-fg">
            HIR Curier &middot; v{APP_VERSION}
          </p>

          <ul className="divide-y divide-hir-border/60">
            <LegalLink
              icon={<FileText className="h-4 w-4 text-hir-muted-fg" aria-hidden />}
              label="Termeni și condiții"
              href="https://hirforyou.ro/termeni"
            />
            <LegalLink
              icon={<Shield className="h-4 w-4 text-hir-muted-fg" aria-hidden />}
              label="Politica de confidențialitate"
              href="https://hirforyou.ro/confidentialitate"
            />
            <LegalLink
              icon={<ExternalLink className="h-4 w-4 text-hir-muted-fg" aria-hidden />}
              label="Contact ANPC (SAL)"
              href="https://anpc.ro/sal/"
            />
            <LegalLink
              icon={<Shield className="h-4 w-4 text-hir-muted-fg" aria-hidden />}
              label="Drepturi GDPR"
              href="https://hirforyou.ro/gdpr"
            />
          </ul>

          <p className="mt-4 text-[11px] text-hir-muted-fg">
            Procesare date conform Regulamentului UE 2016/679 (GDPR).
          </p>
        </div>
      </section>
    </div>
  );
}

function ProfileRowItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span aria-hidden className="shrink-0">{icon}</span>
      <span className="w-16 shrink-0 text-xs text-hir-muted-fg">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right text-sm font-medium text-hir-fg">{value}</span>
    </li>
  );
}

function LegalLink({
  icon,
  label,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span aria-hidden className="shrink-0">{icon}</span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 flex-1 text-sm text-hir-fg hover:text-violet-400 hover:underline"
      >
        {label}
      </a>
      <ExternalLink className="h-3 w-3 shrink-0 text-hir-muted-fg" aria-hidden />
    </li>
  );
}
