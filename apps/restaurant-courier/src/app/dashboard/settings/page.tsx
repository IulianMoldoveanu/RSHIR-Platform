import { Card, CardContent, CardHeader, CardTitle } from '@hir/ui';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateCapabilitiesAction } from './actions';

export const dynamic = 'force-dynamic';

type ProfileRow = {
  full_name: string | null;
  phone: string | null;
  vehicle_type: 'BIKE' | 'SCOOTER' | 'CAR';
  status: 'INACTIVE' | 'ACTIVE' | 'SUSPENDED';
  capabilities: string[] | null;
};

const VEHICLE_LABEL: Record<ProfileRow['vehicle_type'], string> = {
  BIKE: 'Bicicletă',
  SCOOTER: 'Scuter / Motocicletă',
  CAR: 'Mașină',
};

type CapabilityDef = {
  id: 'pharma' | 'cash' | 'alcohol';
  label: string;
  description: string;
};

const CAPABILITIES: CapabilityDef[] = [
  {
    id: 'cash',
    label: 'Plată cash la livrare',
    description: 'Primești comenzi cu plata în numerar. Reconciliere zilnică în aplicație.',
  },
  {
    id: 'alcohol',
    label: 'Livrare alcool',
    description: 'Verificare vârsta destinatarului obligatorie.',
  },
  {
    id: 'pharma',
    label: 'Livrare farmacie',
    description: 'Necesită certificare HIR Pharma — verifică-te cu suportul înainte de a bifa.',
  },
];

export default async function SettingsPage() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from('courier_profiles')
    .select('full_name, phone, vehicle_type, status, capabilities')
    .eq('user_id', user.id)
    .maybeSingle();
  const profile = data as ProfileRow | null;
  const active = new Set(profile?.capabilities ?? []);

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
          <CardTitle>Tipuri de comenzi</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-zinc-500">
            Bifează ce poți să livrezi. Vom trimite doar comenzi care se potrivesc.
          </p>
          <form action={updateCapabilitiesAction} className="space-y-3">
            {CAPABILITIES.map((cap) => (
              <label
                key={cap.id}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3 hover:border-violet-500/40"
              >
                <input
                  type="checkbox"
                  name="capability"
                  value={cap.id}
                  defaultChecked={active.has(cap.id)}
                  className="mt-1 h-4 w-4 accent-violet-500"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-zinc-100">{cap.label}</span>
                  <span className="text-xs text-zinc-500">{cap.description}</span>
                </span>
              </label>
            ))}
            <button
              type="submit"
              className="w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-500"
            >
              Salvează preferințele
            </button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Editare cont</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-500">
          Pentru schimbarea numelui, telefonului sau vehiculului, contactează suportul HIR.
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
