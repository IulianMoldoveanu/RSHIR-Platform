import { Card, CardContent, CardHeader, CardTitle } from '@hir/ui';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type ProfileRow = {
  full_name: string | null;
  status: 'INACTIVE' | 'ACTIVE' | 'SUSPENDED';
  vehicle_type: 'BIKE' | 'SCOOTER' | 'CAR';
};

type ShiftRow = {
  id: string;
  started_at: string;
};

export default async function DashboardHome() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  const { data: profileData } = await admin
    .from('courier_profiles')
    .select('full_name, status, vehicle_type')
    .eq('user_id', user.id)
    .maybeSingle();
  const profile = profileData as ProfileRow | null;

  const { data: shiftData } = await admin
    .from('courier_shifts')
    .select('id, started_at')
    .eq('courier_user_id', user.id)
    .eq('status', 'ONLINE')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const activeShift = shiftData as ShiftRow | null;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { count: deliveredToday } = await admin
    .from('courier_orders')
    .select('*', { count: 'exact', head: true })
    .eq('assigned_courier_user_id', user.id)
    .eq('status', 'DELIVERED')
    .gte('updated_at', startOfDay.toISOString());

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">
          Bună, {profile?.full_name ?? 'curier'} 👋
        </h1>
        <p className="text-sm text-zinc-500">Status: {profile?.status ?? 'INACTIVE'}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tură curentă</CardTitle>
        </CardHeader>
        <CardContent>
          {activeShift ? (
            <p className="text-sm text-emerald-700">
              Online de la{' '}
              <strong>
                {new Date(activeShift.started_at).toLocaleTimeString('ro-RO', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </strong>
            </p>
          ) : (
            <p className="text-sm text-zinc-500">
              Nu ești în tură. Pornește tura din secțiunea <strong>Tură</strong>.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs uppercase tracking-wide text-zinc-500">
              Comenzi azi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-zinc-900">{deliveredToday ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs uppercase tracking-wide text-zinc-500">
              Câștiguri azi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-zinc-900">— RON</p>
            <p className="text-[11px] text-zinc-500">calcul în curând</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
