import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// Wolt-style call masking via the Twilio Proxy REST API.
//
// Each Proxy Session participant is assigned a `proxy_identifier` — the number
// that participant dials (from their real number) to reach the OTHER party.
// So the courier dials their proxy number to reach the customer and vice-versa;
// neither ever sees the other's real phone.
//
// Entirely behind CALL_MASKING_ENABLED. With the flag off (or Twilio not
// provisioned) every entry point returns { ok:false, reason:'disabled' } and
// makes NO external call — the existing direct-dial UX is untouched.
//
// Activation (operator):
//   1. Create a Twilio Proxy Service (it owns the number pool).
//   2. Set env on the courier app: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
//      (already set for OTP), TWILIO_PROXY_SERVICE_SID, CALL_MASKING_ENABLED=true.

const PROXY_BASE = 'https://proxy.twilio.com/v1';
const SESSION_TTL_SECONDS = 4 * 60 * 60; // 4h — covers an active delivery

export type MaskResult =
  | { ok: true; courierProxyNumber: string; clientProxyNumber: string }
  | { ok: false; reason: 'disabled' | 'twilio_error' | 'bad_phone' };

export function isCallMaskingEnabled(): boolean {
  return (
    process.env.CALL_MASKING_ENABLED === 'true' &&
    !!process.env.TWILIO_ACCOUNT_SID &&
    !!process.env.TWILIO_AUTH_TOKEN &&
    !!process.env.TWILIO_PROXY_SERVICE_SID
  );
}

const E164 = /^\+[1-9]\d{1,14}$/;

function authHeader(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID ?? '';
  const token = process.env.TWILIO_AUTH_TOKEN ?? '';
  return 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
}

async function twilioPost(
  url: string,
  params: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

async function twilioGet(
  url: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(url, { headers: { Authorization: authHeader() } });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

/** Add one participant; returns its assigned proxy number (proxy_identifier). */
async function addParticipant(
  serviceSid: string,
  sessionSid: string,
  identifier: string,
  friendlyName: string,
): Promise<string | null> {
  const { status, body } = await twilioPost(
    `${PROXY_BASE}/Services/${serviceSid}/Sessions/${sessionSid}/Participants`,
    { Identifier: identifier, FriendlyName: friendlyName },
  );
  if (status >= 200 && status < 300 && typeof body.proxy_identifier === 'string') {
    return body.proxy_identifier;
  }
  return null;
}

/**
 * Get-or-create a masked session for an order and return both proxy numbers.
 * Reuses the row in courier_call_sessions if a live session already exists.
 */
export async function getOrCreateMaskedSession(opts: {
  courierOrderId: string;
  courierPhone: string;
  clientPhone: string;
}): Promise<MaskResult> {
  if (!isCallMaskingEnabled()) return { ok: false, reason: 'disabled' };
  if (!E164.test(opts.courierPhone) || !E164.test(opts.clientPhone)) {
    return { ok: false, reason: 'bad_phone' };
  }

  const serviceSid = process.env.TWILIO_PROXY_SERVICE_SID as string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // 1. Reuse a live stored session.
  const { data: existing } = await admin
    .from('courier_call_sessions')
    .select('twilio_session_sid, courier_proxy_number, client_proxy_number, status, expires_at')
    .eq('courier_order_id', opts.courierOrderId)
    .maybeSingle();
  if (
    existing &&
    existing.status === 'OPEN' &&
    existing.courier_proxy_number &&
    existing.client_proxy_number &&
    (!existing.expires_at || new Date(existing.expires_at).getTime() > Date.now())
  ) {
    return {
      ok: true,
      courierProxyNumber: existing.courier_proxy_number,
      clientProxyNumber: existing.client_proxy_number,
    };
  }

  try {
    // 2. Create the Proxy session (UniqueName = order, so Twilio dedups). On a
    //    409 the session already exists — fetch it by unique name.
    const uniqueName = `order:${opts.courierOrderId}`;
    let sessionSid: string | null = null;
    const created = await twilioPost(`${PROXY_BASE}/Services/${serviceSid}/Sessions`, {
      UniqueName: uniqueName,
      Ttl: String(SESSION_TTL_SECONDS),
      Mode: 'voice',
    });
    if (created.status >= 200 && created.status < 300 && typeof created.body.sid === 'string') {
      sessionSid = created.body.sid;
    } else if (created.status === 409) {
      const fetched = await twilioGet(
        `${PROXY_BASE}/Services/${serviceSid}/Sessions/${encodeURIComponent(uniqueName)}`,
      );
      if (typeof fetched.body.sid === 'string') sessionSid = fetched.body.sid;
    }
    if (!sessionSid) return { ok: false, reason: 'twilio_error' };

    // 3. Add both participants and capture their proxy numbers.
    const courierProxy = await addParticipant(serviceSid, sessionSid, opts.courierPhone, 'courier');
    const clientProxy = await addParticipant(serviceSid, sessionSid, opts.clientPhone, 'customer');
    if (!courierProxy || !clientProxy) return { ok: false, reason: 'twilio_error' };

    // 4. Persist for reuse.
    await admin.from('courier_call_sessions').upsert(
      {
        courier_order_id: opts.courierOrderId,
        twilio_session_sid: sessionSid,
        courier_proxy_number: courierProxy,
        client_proxy_number: clientProxy,
        status: 'OPEN',
        expires_at: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
      },
      { onConflict: 'courier_order_id' },
    );

    return { ok: true, courierProxyNumber: courierProxy, clientProxyNumber: clientProxy };
  } catch (err) {
    console.error('[call-masking] session error', err instanceof Error ? err.message : err);
    return { ok: false, reason: 'twilio_error' };
  }
}
