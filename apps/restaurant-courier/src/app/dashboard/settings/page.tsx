import Link from 'next/link';
import { HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@hir/ui';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateVehicleAction } from '../actions';

export const dynamic = 'force-dynamic';

type ProfileRow = {
  full_name: string | null;
  phone: string | null;
  vehicle_type: 'BIKE' | 'SCOOTER' | 'CAR';
  status: 'INACTIVE' | 'ACTIVE' | 'SUSPENDED';
};

const VEHICLE_LABEL: Record<ProfileRow['vehicle_type'], string> = {
  BIKE: 'Bicicletă',
  SCOOTER: 'Scuter / Motocicletă',
  CAR: 'Mașină',
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
    .select('full_name, phone, vehicle_type, status')
    .eq('user_id', user.id)
    .maybeSingle();
  const profile = data as ProfileRow | null;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Email" value={user.email ?? '—'} />
          <Row label="Nume" value={profile?.full_name ?? '—'} />
          <Row label="Telefon" value={profile?.phone ?? '—'} />
          <Row
            label="Vehicul"
            value={profile ? VEHICLE_LABEL[profile.vehicle_type] : '—'}
          />
          <Row label="Status" value={profile?.status ?? '—'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vehicul</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateVehicleAction} className="flex items-center gap-2">
            <select
              name="vehicle_type"
              defaultValue={profile?.vehicle_type ?? 'BIKE'}
              className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            >
              <option value="BIKE">Bicicletă</option>
              <option value="SCOOTER">Scuter / Motocicletă</option>
              <option value="CAR">Mașină</option>
            </select>
            <button
              type="submit"
              className="rounded-md bg-violet-500 px-3 py-2 text-sm font-medium text-white hover:bg-violet-400"
            >
              Salvează
            </button>
          </form>
          <p className="mt-2 text-[11px] text-zinc-500">
            Schimbă vehiculul când treci de la livrarea pe bicicletă la scuter sau invers.
            Pentru rest (nume, telefon), contactează suportul.
          </p>
        </CardContent>
      </Card>

      <Link
        href="/dashboard/help"
        className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm hover:bg-zinc-50"
      >
        <HelpCircle className="h-5 w-5 text-violet-500" aria-hidden />
        <div className="flex-1">
          <p className="font-medium text-zinc-900">Ajutor & FAQ</p>
          <p className="text-xs text-zinc-500">Cum funcționează plata, fotografiile, urgențele</p>
        </div>
        <span className="text-zinc-400">›</span>
      </Link>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className="font-medium text-zinc-900">{value}</span>
    </div>
  );
}
