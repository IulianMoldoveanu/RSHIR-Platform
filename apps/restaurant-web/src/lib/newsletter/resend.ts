import 'server-only';

// Track A #11: minimal Resend client for newsletter confirmation + welcome
// emails. We hit the Resend REST API directly via fetch instead of pulling
// in the `resend` SDK, since the only other email path in this repo lives in
// a Deno Edge Function (notify-customer-status) and the SDK isn't a workspace
// dependency. Two endpoints, single payload — fetch is fine.
//
// Env (set as Vercel env vars):
//   RESEND_API_KEY     Resend API key (required)
//   RESEND_FROM_EMAIL  sender address (defaults to onboarding@resend.dev,
//                      Resend's shared sandbox — works without domain verify)

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; reason: 'not_configured' | 'request_failed'; detail?: string };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: 'not_configured' };
  const from = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, reason: 'request_failed', detail: detail.slice(0, 500) };
    }
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: data?.id ?? null };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: 'request_failed', detail };
  }
}
