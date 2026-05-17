import Link from 'next/link';
import {
  Activity,
  Bell,
  CalendarClock,
  CalendarOff,
  Camera,
  ChevronRight,
  ExternalLink,
  FileText,
  Flame,
  HelpCircle,
  History,
  LogOut,
  Mail,
  Phone,
  Info,
  Receipt,
  Settings,
  Shield,
  Stethoscope,
  User,
} from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateAvatarUrlAction, updateVehicleTypeAction, logoutAction } from '../actions';
import { AvatarUpload } from '@/components/avatar-upload';
import { VehicleSelector } from '@/components/vehicle-selector';
import { ThemeToggle } from '@/components/theme-toggle';
import { DocumentExpiryCard } from '@/components/document-expiry-card';
import { ReplayOnboardingButton } from '@/components/replay-onboarding-button';
import { Card } from '@/components/card';
import { SettingsRow } from '@/components/settings-row';

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
      <header className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-500/30">
          <Settings className="h-5 w-5 text-violet-300" aria-hidden />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-hir-fg">Setări</h1>
          <p className="mt-0.5 text-sm leading-relaxed text-hir-muted-fg">
            Profil, vehicul, notificări și jurnal activitate.
          </p>
        </div>
      </header>

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
          <Card padding="lg">
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
          </Card>

          {/* Vehicle picker */}
          <Card padding="lg">
            <p className="mb-1 text-base font-semibold text-hir-fg">Vehicul</p>
            <p className="mb-4 text-[11px] text-hir-muted-fg">
              Selectează vehiculul cu care livrezi astăzi.
            </p>
            <VehicleSelector
              initial={profile?.vehicle_type ?? 'BIKE'}
              onSave={updateVehicleTypeAction}
            />
          </Card>

          {/* Document expiry tracker — LocalStorage memento */}
          <DocumentExpiryCard />
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
          <Card padding="lg">
            <ThemeToggle />
          </Card>

          {/* Notification preferences */}
          <SettingsRow
            href="/dashboard/settings/notifications"
            icon={<Bell className="h-5 w-5 text-violet-400" aria-hidden />}
            label="Notificări"
            description="Comenzi, mesaje, urgențe, anunțuri"
          />
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
          <SettingsRow
            href="/dashboard/proofs"
            icon={<Camera className="h-5 w-5 text-violet-400" aria-hidden />}
            label="Fotografii livrări"
            description="Arhivă dovezi livrare, ultimele 30 zile"
          />

          <SettingsRow
            href="/dashboard/schedule"
            icon={<CalendarClock className="h-5 w-5 text-violet-400" aria-hidden />}
            label="Program săptămânal"
            description="Rezervă ture pentru 7 zile înainte"
          />

          <SettingsRow
            href="/dashboard/history"
            icon={<History className="h-5 w-5 text-violet-400" aria-hidden />}
            label="Istoricul curselor"
            description="Ultimele 100 de comenzi finalizate"
          />

          <SettingsRow
            href="/dashboard/busy-hours"
            icon={<Flame className="h-5 w-5 text-violet-400" aria-hidden />}
            label="Ore cu volum mare"
            description="Planifică-ți tura după cererea zilei"
          />

          <SettingsRow
            href="/dashboard/time-off"
            icon={<CalendarOff className="h-5 w-5 text-violet-400" aria-hidden />}
            label="Cerere zile libere"
            description="Concediu medical, vacanță, cauze personale"
          />

          <SettingsRow
            href="/dashboard/help"
            icon={<HelpCircle className="h-5 w-5 text-violet-400" aria-hidden />}
            label="Ajutor & FAQ"
            description="Plată, fotografii, urgențe"
          />

          {/* Replay onboarding */}
          <div className="flex items-start gap-3 rounded-2xl border border-hir-border bg-hir-surface px-5 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/10">
              <HelpCircle className="h-5 w-5 text-violet-400" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="text-sm font-semibold text-hir-fg">Reia tutorialul</p>
                <p className="mt-0.5 text-xs text-hir-muted-fg">
                  Vezi din nou ghidul de pornire în 4 pași și carusel-ul de bun venit
                </p>
              </div>
              <ReplayOnboardingButton />
            </div>
          </div>

          <SettingsRow
            href="/dashboard/about"
            icon={<Info className="h-5 w-5 text-violet-400" aria-hidden />}
            label="Despre HIR Curier"
            description="Versiune, noutăți, librării open source"
          />

          <SettingsRow
            href="/dashboard/diagnostics"
            icon={<Stethoscope className="h-5 w-5 text-violet-400" aria-hidden />}
            label="Diagnostic dispozitiv"
            description="GPS, sunet, notificări, baterie"
          />

          <SettingsRow
            href="/dashboard/settings/activity"
            icon={<Activity className="h-5 w-5 text-violet-400" aria-hidden />}
            label="Istoricul activității mele"
            description="Ultimele 100 de acțiuni înregistrate"
          />

          {/* Tax export placeholder — #477 */}
          <SettingsRow
            icon={<Receipt className="h-5 w-5 text-hir-muted-fg" aria-hidden />}
            iconBg="bg-hir-border"
            label="Export fiscal"
            description="Disponibil în curând"
            disabled
          />

          {/* Logout */}
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl border border-hir-border bg-hir-surface px-5 py-4 text-left transition-colors hover:border-rose-500/40 hover:bg-rose-500/5 active:scale-[0.99]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500/10">
                <LogOut className="h-5 w-5 text-rose-400" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-rose-400">Deconectare</p>
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

        <Card padding="lg">
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
        </Card>
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
