import Link from 'next/link';
import { Bike, Car, ChevronRight, HelpCircle, Mail, Phone, Truck, User } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateAvatarUrlAction, updateVehicleAction } from '../actions';
import { AvatarUpload } from '@/components/avatar-upload';

export const dynamic = 'force-dynamic';

type ProfileRow = {
  full_name: string | null;
  phone: string | null;
  vehicle_type: 'BIKE' | 'SCOOTER' | 'CAR';
  status: 'INACTIVE' | 'ACTIVE' | 'SUSPENDED';
  avatar_url: string | null;
};

const VEHICLE_LABEL: Record<ProfileRow['vehicle_type'], string> = {
  BIKE: 'Bicicletă',
  SCOOTER: 'Scuter / Motocicletă',
  CAR: 'Mașină',
};

const STATUS_LABEL: Record<ProfileRow['status'], { label: string; tone: string }> = {
  ACTIVE: { label: 'Activ', tone: 'bg-emerald-500/10 text-emerald-300' },
  INACTIVE: { label: 'Inactiv', tone: 'bg-zinc-800 text-zinc-400' },
  SUSPENDED: { label: 'Suspendat', tone: 'bg-amber-500/10 text-amber-300' },
};

export default async function SettingsPage() {
  const supabase = createServerClient();
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
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-base font-semibold text-zinc-100">Profil</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadge.tone}`}
          >
            {statusBadge.label}
          </span>
        </div>
        <div className="mb-4">
          <AvatarUpload
            userId={user.id}
            initialUrl={profile?.avatar_url ?? null}
            fullName={profile?.full_name ?? null}
            saveAvatarUrl={updateAvatarUrlAction}
          />
        </div>
        <ul className="divide-y divide-zinc-800">
          <ProfileRowItem
            icon={<User className="h-4 w-4 text-zinc-400" aria-hidden />}
            label="Nume"
            value={profile?.full_name ?? '—'}
          />
          <ProfileRowItem
            icon={<Mail className="h-4 w-4 text-zinc-400" aria-hidden />}
            label="Email"
            value={user.email ?? '—'}
          />
          <ProfileRowItem
            icon={<Phone className="h-4 w-4 text-zinc-400" aria-hidden />}
            label="Telefon"
            value={profile?.phone ?? '—'}
          />
        </ul>
        <p className="mt-3 text-[11px] text-zinc-500">
          Pentru a modifica numele sau telefonul, contactează suportul.
        </p>
      </section>

      {/* Vehicle picker — segmented dark control. */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-3 text-base font-semibold text-zinc-100">Vehicul</h2>
        <p className="mb-3 text-xs text-zinc-500">
          {profile
            ? `În prezent: ${VEHICLE_LABEL[profile.vehicle_type]}`
            : 'Alege vehiculul cu care livrezi.'}
        </p>
        <form action={updateVehicleAction} className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            {/* When the profile row is missing, default to BIKE so the form
                always submits a valid value. updateVehicleAction otherwise
                bails on isVehicleType(raw) and the Save button looks broken. */}
            <VehicleOption
              value="BIKE"
              icon={<Bike className="h-5 w-5" aria-hidden />}
              label="Bicicletă"
              checked={(profile?.vehicle_type ?? 'BIKE') === 'BIKE'}
            />
            <VehicleOption
              value="SCOOTER"
              icon={<Truck className="h-5 w-5" aria-hidden />}
              label="Scuter"
              checked={profile?.vehicle_type === 'SCOOTER'}
            />
            <VehicleOption
              value="CAR"
              icon={<Car className="h-5 w-5" aria-hidden />}
              label="Mașină"
              checked={profile?.vehicle_type === 'CAR'}
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-400 active:bg-violet-600"
          >
            Salvează
          </button>
        </form>
      </section>

      {/* Help link */}
      <Link
        href="/dashboard/help"
        className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 hover:border-violet-500/40 hover:bg-zinc-900/70"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-500/10">
          <HelpCircle className="h-5 w-5 text-violet-400" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-100">Ajutor & FAQ</p>
          <p className="text-xs text-zinc-500">Plată, fotografii, urgențe</p>
        </div>
        <ChevronRight className="h-4 w-4 text-zinc-500" aria-hidden />
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
    <li className="flex items-center gap-3 py-2.5">
      <span aria-hidden>{icon}</span>
      <span className="flex-1 text-xs text-zinc-500">{label}</span>
      <span className="text-sm font-medium text-zinc-100">{value}</span>
    </li>
  );
}

// Radio-styled segmented vehicle picker. The hidden input keeps it form-native
// (POSTs `vehicle_type` with the chosen value) while the label provides the
// visible touch target — fine for mobile thumbs.
function VehicleOption({
  value,
  icon,
  label,
  checked,
}: {
  value: 'BIKE' | 'SCOOTER' | 'CAR';
  icon: React.ReactNode;
  label: string;
  checked: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border px-2 py-3 text-xs font-medium transition ${
        checked
          ? 'border-violet-500 bg-violet-500/10 text-violet-200'
          : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
      }`}
    >
      <input
        type="radio"
        name="vehicle_type"
        value={value}
        defaultChecked={checked}
        className="sr-only"
      />
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </label>
  );
}
