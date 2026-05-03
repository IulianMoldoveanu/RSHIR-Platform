import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { startShiftAction } from './actions';
import { SwipeButton } from '@/components/swipe-button';
import { RiderMap } from '@/components/rider-map';

export const dynamic = 'force-dynamic';

type ProfileRow = {
  full_name: string | null;
  status: 'INACTIVE' | 'ACTIVE' | 'SUSPENDED';
};

type ShiftRow = { id: string };

type ActiveOrderRow = { id: string };

// Shift OFFLINE → swipe-to-start CTA.
// Shift ONLINE + active order → redirect to /dashboard/orders/[id].
// Shift ONLINE + no active order → full-screen RiderMap.
export default async function DashboardHome() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  const [{ data: profileData }, { data: shiftData }] = await Promise.all([
    admin
      .from('courier_profiles')
      .select('full_name, status')
      .eq('user_id', user.id)
      .maybeSingle(),
    admin
      .from('courier_shifts')
      .select('id')
      .eq('courier_user_id', user.id)
      .eq('status', 'ONLINE')
      .limit(1)
      .maybeSingle(),
  ]);

  const profile = profileData as ProfileRow | null;
  const shift = shiftData as ShiftRow | null;

  // If a shift is active, look for an in-progress order to redirect to.
  if (shift) {
    const { data: activeOrderData } = await admin
      .from('courier_orders')
      .select('id')
      .eq('assigned_courier_user_id', user.id)
      .in('status', ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const activeOrder = activeOrderData as ActiveOrderRow | null;
    if (activeOrder) redirect(`/dashboard/orders/${activeOrder.id}`);
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 pt-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
          Bună, {profile?.full_name?.split(' ')[0] ?? 'curier'}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {shift ? 'Ești online — așteaptă următoarea comandă.' : 'Pornește tura pentru a primi comenzi.'}
        </p>
      </div>

      {shift ? (
        <RiderMap />
      ) : (
        <div className="flex flex-col gap-3 pt-4">
          <SwipeButton label="→ Glisează pentru a porni tura" onConfirm={startShiftAction} />
          <p className="text-center text-[11px] text-zinc-500">
            Vei începe să primești comenzi imediat ce tura este activă.
          </p>
        </div>
      )}
    </div>
  );
}

