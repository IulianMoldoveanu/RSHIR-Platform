import { Button, Card, CardContent, CardHeader, CardTitle } from '@hir/ui';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { startShiftAction, endShiftAction } from '../actions';

export const dynamic = 'force-dynamic';

type ShiftRow = { id: string; started_at: string };

export default async function ShiftPage() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from('courier_shifts')
    .select('id, started_at')
    .eq('courier_user_id', user.id)
    .eq('status', 'ONLINE')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const active = data as ShiftRow | null;

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Tură</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {active ? (
            <>
              <p className="text-sm text-emerald-700">
                Ești <strong>online</strong> de la{' '}
                {new Date(active.started_at).toLocaleTimeString('ro-RO', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                .
              </p>
              <form action={endShiftAction}>
                <Button type="submit" className="w-full" variant="outline">
                  Închide tura
                </Button>
              </form>
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-600">
                Pornește tura pentru a primi comenzi.
              </p>
              <form action={startShiftAction}>
                <Button type="submit" className="w-full">
                  Pornește tura
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
