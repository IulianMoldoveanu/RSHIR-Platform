// Storefront checkout OTP — phone-number verification before order
// creation. Closes P0 audit #5 (fraud / harassment via COD orders to
// arbitrary phone numbers).
//
// Provider: Twilio Programmable Messaging. We hit the REST API directly
// (no SDK) to keep the bundle small. Twilio is already the canonical
// SMS/voice provider for the rest of the platform (cf. apps/restaurant-
// admin/src/dashboard/admin/system/operator-actions/health-checks.ts).
//
// Fallback: when TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM are
// not configured the helper returns a 'not_configured' error so the route
// handler can decide whether to short-circuit (prod) or return the code
// in the response body (dev). NEVER set RSHIR_OTP_DEV_ECHO=1 in prod.
import { createHash, randomInt } from 'node:crypto';

export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_DEV_ECHO_ENV = 'RSHIR_OTP_DEV_ECHO';

/** Normalize a typed phone (with or without country code) to E.164 RO. */
export function normalizeRoPhoneE164(raw: string): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  let local: string;
  if (digits.startsWith('0040')) local = digits.slice(4);
  else if (digits.startsWith('40')) local = digits.slice(2);
  else if (digits.startsWith('0')) local = digits.slice(1);
  else local = digits;
  // RO mobiles are 9 digits starting with 7. Reject anything shorter
  // (avoids accidentally OTP-ing to a malformed number that Twilio will
  // bill us for and never deliver).
  if (local.length !== 9) return null;
  if (!local.startsWith('7')) return null;
  return `+40${local}`;
}

/** Generate a 6-digit numeric code. crypto.randomInt is CSPRNG-backed. */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Hash with an env-supplied pepper so a leaked DB dump alone can't be
 * brute-forced against /verify. SHA-256 is fine here — codes live ≤5min
 * and the search space is 1M, so adding a pepper raises the bar enough.
 */
export function hashOtpCode(code: string): string {
  const pepper = process.env.RSHIR_OTP_PEPPER ?? '';
  return createHash('sha256').update(`${pepper}|${code}`).digest('hex');
}

export type SmsSendResult =
  | { ok: true }
  | { ok: false; reason: 'not_configured' }
  | { ok: false; reason: 'send_failed'; status: number; detail: string };

/**
 * Fire-and-await Twilio Messages API. Caller decides what to do with
 * `not_configured`. Failures are surfaced — we never silently swallow
 * because that would let attackers tell "code requested but never
 * delivered" from "code delivered" via the route timing.
 */
export async function sendOtpSms(
  phoneE164: string,
  code: string,
): Promise<SmsSendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) {
    return { ok: false, reason: 'not_configured' };
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
  const body = new URLSearchParams({
    To: phoneE164,
    From: from,
    Body: `Codul tau HIR: ${code}. Expira in 5 minute. Nu il transmite nimanui.`,
  });
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
  } catch (e) {
    return { ok: false, reason: 'send_failed', status: 0, detail: (e as Error).message };
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return { ok: false, reason: 'send_failed', status: res.status, detail: detail.slice(0, 500) };
  }
  return { ok: true };
}

/** True when the route handler should expose generated codes to callers. */
export function devEchoEnabled(): boolean {
  return process.env[OTP_DEV_ECHO_ENV] === '1';
}
