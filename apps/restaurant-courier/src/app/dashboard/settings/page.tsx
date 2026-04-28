import { Card, CardContent, CardHeader, CardTitle } from '@hir/ui';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
          <CardTitle>Editare</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-500">
          Vine în următorul update — pentru moment, contactează suportul HIR
          dacă vrei să schimbi ceva.
        </CardContent>
      </Card>
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
