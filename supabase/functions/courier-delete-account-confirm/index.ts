/**
 * Edge Function: courier-delete-account-confirm
 *
 * Called by the courier app `requestAccountDeletion` server action right
 * after it marks the courier_profile SUSPENDED + deletion_requested_at.
 * This function:
 *   1. Authenticates the courier via Bearer token.
 *   2. Inserts an audit row into courier_account_deletion_requests.
 *   3. Sends a confirmation email via Resend so the courier has a paper
 *      trail of the request and the 30-day GDPR Art. 17 timeline.
 *
 * POST /functions/v1/courier-delete-account-confirm
 * Auth:  Bearer <supabase access token>
 * Body:  { courier_email: string, requested_at: string (ISO) }
 *
 * Env (Supabase function secrets):
 *   RESEND_API_KEY                  — Resend API key.
 *   RESEND_FROM_EMAIL               — sender (default onboarding@resend.dev).
 * Auto-injected:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { Resend } from 'https://esm.sh/resend@4.0.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Missing authorization header' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  const FROM = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';

  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'supabase_env_missing' });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Verify the JWT and resolve the courier user.
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return json(401, { error: 'Unauthorized' });

  let body: { courier_email?: string; requested_at?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  // Trust the verified JWT email over the client payload; client value is a
  // hint only. Falls back to body.courier_email when auth.users.email is null
  // (some phone-only providers).
  const email = user.email ?? body.courier_email;
  if (!email) return json(400, { error: 'no_email_on_account' });

  const requestedAt = body.requested_at && !Number.isNaN(Date.parse(body.requested_at))
    ? body.requested_at
    : new Date().toISOString();

  // Insert the audit row. Unique partial index on (courier_user_id) where
  // completed_at is null means a duplicate request is a no-op — that's fine,
  // we still send the email so the courier gets confirmation on each request.
  const { error: insertErr } = await supabase
    .from('courier_account_deletion_requests')
    .insert({
      courier_user_id: user.id,
      email,
      requested_at: requestedAt,
    });

  // 23505 = unique_violation. Treat as idempotent success.
  if (insertErr && insertErr.code !== '23505') {
    console.error('[courier-delete-account-confirm] insert error', insertErr);
    return json(500, { error: 'audit_insert_failed' });
  }

  // Email is best-effort. If Resend is not configured, we still return ok so
  // the courier flow proceeds — the audit row is the source of truth.
  if (!RESEND_API_KEY) {
    return json(200, { ok: true, email_sent: false, reason: 'resend_not_configured' });
  }

  try {
    const resend = new Resend(RESEND_API_KEY);
    const r = await resend.emails.send({
      from: FROM,
      to: email,
      subject: 'Cerere de ștergere cont HIR Curier — confirmare',
      text:
        'Salut,\n\n' +
        'Am primit cererea ta de ștergere a contului HIR Curier.\n\n' +
        'Procesul se va finaliza în 30 de zile, conform GDPR Art. 17 ' +
        '(dreptul la ștergere). În acest interval păstrăm doar datele cerute ' +
        'de lege (5 ani pentru documente fiscale).\n\n' +
        'Dacă ai cerut din greșeală sau vrei să revii pe platformă, ' +
        'răspunde la acest email înainte de termenul de 30 zile.\n\n' +
        'Echipa HIR',
      html:
        '<p>Salut,</p>' +
        '<p>Am primit cererea ta de ștergere a contului <strong>HIR Curier</strong>.</p>' +
        '<p>Procesul se va finaliza în <strong>30 de zile</strong>, conform GDPR Art. 17 ' +
        '(dreptul la ștergere). În acest interval păstrăm doar datele cerute de lege ' +
        '(5 ani pentru documente fiscale).</p>' +
        '<p>Dacă ai cerut din greșeală sau vrei să revii pe platformă, răspunde la ' +
        'acest email înainte de termenul de 30 zile.</p>' +
        '<p>— Echipa HIR</p>',
    });
    if (r.error) {
      console.error('[courier-delete-account-confirm] resend error', r.error);
      return json(200, { ok: true, email_sent: false });
    }
  } catch (e) {
    console.error('[courier-delete-account-confirm] resend throw', e);
    return json(200, { ok: true, email_sent: false });
  }

  return json(200, { ok: true, email_sent: true });
});
