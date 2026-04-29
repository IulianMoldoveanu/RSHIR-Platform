import 'server-only';

/**
 * Fires the `courier-push-dispatch` Edge Function for a newly created
 * courier order. Best-effort — failures are logged but never thrown so
 * the order-create response stays fast and resilient (the order has
 * already been persisted by the caller).
 *
 * Returns the dispatch summary on success or null on any failure.
 */
export async function dispatchCourierPushForNewOrder(args: {
  fleetId: string;
  orderId: string;
  title?: string;
  body?: string;
}): Promise<{ sent: number; pruned: number; failed: number; total: number } | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/courier-push-dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        fleet_id: args.fleetId,
        order_id: args.orderId,
        ...(args.title ? { title: args.title } : {}),
        ...(args.body ? { body: args.body } : {}),
      }),
    });
    if (!res.ok) {
      console.error(
        '[push-dispatch] non-2xx',
        res.status,
        await res.text().catch(() => ''),
      );
      return null;
    }
    return (await res.json()) as {
      sent: number;
      pruned: number;
      failed: number;
      total: number;
    };
  } catch (err) {
    console.error('[push-dispatch] fetch failed', (err as Error).message);
    return null;
  }
}
