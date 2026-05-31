import 'server-only';

/**
 * Sends a push notification to a specific courier identified by their
 * auth.users user_id.
 *
 * Invokes the courier-push-dispatch edge function with a `courier_user_id`
 * field. The EF uses this to filter `courier_push_subscriptions` + `courier_push_tokens`
 * to that single user rather than fanning out to the whole fleet.
 *
 * This is best-effort: failures are logged and swallowed so the caller's
 * response is never blocked on push availability.
 */
export async function notifyCourierUser(args: {
  courierUserId: string;
  title: string;
  body: string;
}): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/courier-push-dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        courier_user_id: args.courierUserId,
        title: args.title,
        body: args.body,
      }),
    });
    if (!res.ok) {
      console.error(
        '[courier-push] non-2xx for user',
        args.courierUserId,
        res.status,
        await res.text().catch(() => ''),
      );
    }
  } catch (err) {
    console.error('[courier-push] fetch failed', (err as Error).message);
  }
}
