import Link from 'next/link';
import { ChevronRight, HelpCircle, Mail, Phone, User } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateAvatarUrlAction, updateVehicleTypeAction } from '../actions';
import { AvatarUpload } from '@/components/avatar-upload';
import { VehicleSelector } from '@/components/vehicle-selector';
import { ThemeToggle } from '@/components/theme-toggle';

export const dynamic = 'force-dynamic';

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
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      {/* Profile card */}
      <section className="rounded-2xl border border-hir-border bg-hir-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-base font-semibold text-hir-fg">Profil</h1>
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
      </section>

      {/* Vehicle picker — segmented control with the same 3D miniature
          icons used on the live map. Tapping commits immediately
          (optimistic update + rollback on error); no Save button needed. */}
      <section className="rounded-2xl border border-hir-border bg-hir-surface p-5">
        <h2 className="mb-1 text-base font-semibold text-hir-fg">Vehicul</h2>
        <p className="mb-4 text-[11px] text-hir-muted-fg">
          Selectează vehiculul cu care livrezi astăzi.
        </p>
        <VehicleSelector
          initial={profile?.vehicle_type ?? 'BIKE'}
          onSave={updateVehicleTypeAction}
        />
      </section>

      {/* Theme picker — segmented dark/light/system. F4.5 of the master
          plan. Default is dark; light is opt-in and persisted in
          localStorage by the provider. The chrome (body bg + fg) honours
          the toggle out of the gate; deeper component surfaces are
          migrated in follow-up PRs. */}
      <section className="rounded-2xl border border-hir-border bg-hir-surface p-5">
        <ThemeToggle />
      </section>

      {/* Help link */}
      <Link
        href="/dashboard/help"
        className="flex items-center gap-3 rounded-2xl border border-hir-border bg-hir-surface px-5 py-4 hover:border-violet-500/40 hover:bg-hir-border/60 active:scale-[0.99]"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/10">
          <HelpCircle className="h-5 w-5 text-violet-400" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-hir-fg">Ajutor & FAQ</p>
          <p className="mt-0.5 text-xs text-hir-muted-fg">Plată, fotografii, urgențe</p>
        </div>
        <ChevronRight className="h-4 w-4 text-hir-muted-fg" aria-hidden />
      </Link>
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

