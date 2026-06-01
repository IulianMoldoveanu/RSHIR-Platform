import Link from 'next/link';
import { ChevronLeft, Mail, Phone, Shield, User } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateAvatarUrlAction, updateVehicleTypeAction } from '../../actions';
import { AvatarUpload } from '@/components/avatar-upload';
import { VehicleSelector } from '@/components/vehicle-selector';
import { Card } from '@/components/card';
import { SettingsRow } from '@/components/settings-row';

export const dynamic = 'force-dynamic';

type ProfileRow = {
  full_name: string | null;
  phone: string | null;
  vehicle_type: 'BIKE' | 'SCOOTER' | 'CAR';
  status: 'INACTIVE' | 'ACTIVE' | 'SUSPENDED';
  avatar_url: string | null;
};

const STATUS_LABEL: Record<ProfileRow['status'], { label: string; tone: string }> = {
  ACTIVE: {
    label: 'Activ',
    tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 ring-1 ring-inset ring-emerald-500/20',
  },
  INACTIVE: {
    label: 'Inactiv',
    tone: 'border-hir-border bg-hir-border/40 text-hir-muted-fg ring-1 ring-inset ring-hir-border/60',
  },
  SUSPENDED: {
    label: 'Suspendat',
    tone: 'border-amber-500/40 bg-amber-500/10 text-amber-200 ring-1 ring-inset ring-amber-500/20',
  },
};

export default async function ProfileSettingsPage() {
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
      <header className="flex items-center gap-3">
        <Link
          href="/dashboard/settings"
          aria-label="Înapoi la setări"
          className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full bg-hir-surface text-hir-muted-fg ring-1 ring-hir-border transition-colors hover:text-hir-fg"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </Link>
        <h1 className="text-lg font-semibold tracking-tight text-hir-fg">Profil &amp; vehicul</h1>
      </header>

      {/* Profile card */}
      <Card padding="lg">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-base font-semibold text-hir-fg">Profil</p>
          <span
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusBadge.tone}`}
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
        <VehicleSelector initial={profile?.vehicle_type ?? 'BIKE'} onSave={updateVehicleTypeAction} />
      </Card>

      {/* Identity verification (KYC) — one-time account validation */}
      <SettingsRow
        href="/dashboard/kyc"
        icon={<Shield className="h-5 w-5 text-violet-400" aria-hidden />}
        label="Verificare identitate"
        description="Încarci buletinul o singură dată ca să-ți validăm contul și să primești comenzi."
      />
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
      <span aria-hidden className="shrink-0">
        {icon}
      </span>
      <span className="w-16 shrink-0 text-xs text-hir-muted-fg">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right text-sm font-medium text-hir-fg">
        {value}
      </span>
    </li>
  );
}
