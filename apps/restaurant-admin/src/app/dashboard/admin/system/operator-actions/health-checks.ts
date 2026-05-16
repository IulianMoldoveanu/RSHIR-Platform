// Health probes for the platform-admin Operator Actions dashboard.
//
// Each helper resolves to a small status object — DONE / PENDING / UNKNOWN.
// Probes are intentionally LOCAL: env-presence + Supabase metadata reads
// only. No outbound HTTP to paid vendor APIs (Stripe / Anthropic / Twilio
// etc.) — those are expensive, can hit rate limits, and we only need to
// know "is the operator gate closed" not "is the vendor healthy".
//
// Convention:
//   - DONE     — gate is fully resolved (env var present / row exists).
//   - PENDING  — gate is still on Iulian's plate (env var empty / row absent).
//   - UNKNOWN  — probe could not run (e.g. Supabase admin client missing).
//
// `detail` is OPTIONAL and surfaced in the UI — never includes secret
// material, only presence/absence + counts.

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export type ProbeStatus = 'DONE' | 'PENDING' | 'UNKNOWN';
export type ProbeResult = { status: ProbeStatus; detail?: string };

/** Generic env-presence probe. Treats empty string as absent. */
function envProbe(name: string): ProbeResult {
  const v = process.env[name];
  if (v === undefined || v.trim() === '') return { status: 'PENDING', detail: `${name} nu este setat` };
  return { status: 'DONE', detail: `${name} setat` };
}

/** Manual operator-set flag — `OPERATOR_FLAGS_<name>=done`. */
function manualFlagProbe(name: string): ProbeResult {
  const v = process.env[`OPERATOR_FLAGS_${name}`];
  if (v && v.toLowerCase() === 'done') return { status: 'DONE', detail: 'marcat manual ca finalizat' };
  return { status: 'PENDING', detail: `setează OPERATOR_FLAGS_${name}=done când e gata` };
}

export function checkStripePublishableKey(): ProbeResult {
  return envProbe('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
}

export function checkAnthropicCredit(): ProbeResult {
  // We can only know if a manual snapshot is stored — never call Anthropic.
  const v = process.env.ANTHROPIC_CREDIT_BALANCE_CENTS;
  if (v === undefined || v.trim() === '') {
    return { status: 'UNKNOWN', detail: 'fără snapshot local — verifică console.anthropic.com' };
  }
  const cents = Number(v);
  if (!Number.isFinite(cents)) return { status: 'UNKNOWN', detail: 'snapshot invalid' };
  if (cents <= 0) return { status: 'PENDING', detail: 'sold zero — top-up necesar' };
  return { status: 'DONE', detail: `sold ~$${(cents / 100).toFixed(2)}` };
}

export function checkAuditIntegrityAlertToken(): ProbeResult {
  return envProbe('AUDIT_INTEGRITY_ALERT_TOKEN');
}

export function checkTwilioCreds(): ProbeResult {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (sid && token) return { status: 'DONE', detail: 'SID + token prezenți' };
  if (sid || token) return { status: 'PENDING', detail: 'doar o variabilă prezentă (lipsă SID sau token)' };
  return { status: 'PENDING', detail: 'TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN lipsă' };
}

export function checkWhatsAppCreds(): ProbeResult {
  return envProbe('WHATSAPP_BUSINESS_TOKEN');
}

export function checkOpenAIKey(): ProbeResult {
  return envProbe('OPENAI_API_KEY');
}

export function checkMetaCreds(): ProbeResult {
  return envProbe('META_APP_SECRET');
}

export function checkAnafSpvOauth(): ProbeResult {
  const id = process.env.ANAF_OAUTH_CLIENT_ID;
  const secret = process.env.ANAF_OAUTH_CLIENT_SECRET;
  if (id && secret) return { status: 'DONE', detail: 'client_id + client_secret prezenți' };
  return { status: 'PENDING', detail: 'ANAF_OAUTH_CLIENT_ID / _SECRET lipsă' };
}

export function checkAppleDev(): ProbeResult {
  return manualFlagProbe('APPLE_DEV');
}

export function checkGooglePlay(): ProbeResult {
  return manualFlagProbe('GOOGLE_PLAY');
}

export function checkDatecsHardware(): ProbeResult {
  return manualFlagProbe('DATECS_HARDWARE');
}

export function checkCfZoneRegistration(): ProbeResult {
  return manualFlagProbe('CF_ZONE_REGISTERED');
}

export function checkSentryReplayPostDpa(): ProbeResult {
  return manualFlagProbe('SENTRY_REPLAY_POST_DPA');
}

export function checkOfferedOrderAutoExpiryDecision(): ProbeResult {
  const v = process.env.OFFERED_ORDER_AUTO_EXPIRY_MIN;
  if (v === undefined || v.trim() === '') {
    return { status: 'PENDING', detail: 'decizie de luat — minute până la auto-expirare' };
  }
  const min = Number(v);
  if (!Number.isFinite(min) || min <= 0) return { status: 'PENDING', detail: 'valoare invalidă' };
  return { status: 'DONE', detail: `setat la ${min} min` };
}

/** Existence probe for any tenant having Netopia credentials. */
async function pspCredsExist(provider: 'netopia' | 'viva'): Promise<ProbeResult> {
  try {
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (cols: string, opts?: { count?: 'exact'; head?: boolean }) => {
          eq: (col: string, val: string) => Promise<{ count: number | null; error: { message: string } | null }>;
        };
      };
    };
    const { count, error } = await admin
      .from('psp_credentials')
      .select('tenant_id', { count: 'exact', head: true })
      .eq('provider', provider);
    if (error) return { status: 'UNKNOWN', detail: `eroare query: ${error.message}` };
    if ((count ?? 0) > 0) return { status: 'DONE', detail: `${count} tenant(s) cu credențiale` };
    return { status: 'PENDING', detail: 'niciun tenant nu are credențiale' };
  } catch (e) {
    return { status: 'UNKNOWN', detail: (e as Error).message };
  }
}

export async function checkNetopiaCreds(): Promise<ProbeResult> {
  return pspCredsExist('netopia');
}

export async function checkVivaCreds(): Promise<ProbeResult> {
  return pspCredsExist('viva');
}

export async function checkCourierProofsBucketPrivate(): Promise<ProbeResult> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.getBucket('courier-proofs');
    if (error) {
      // Bucket missing is itself a PENDING state.
      if (error.message.toLowerCase().includes('not found')) {
        return { status: 'PENDING', detail: 'bucket courier-proofs lipsește' };
      }
      return { status: 'UNKNOWN', detail: error.message };
    }
    if (!data) return { status: 'UNKNOWN', detail: 'fără date returnate' };
    if (data.public === false) return { status: 'DONE', detail: 'bucket privat' };
    return { status: 'PENDING', detail: 'bucket încă public — trece-l pe privat' };
  } catch (e) {
    return { status: 'UNKNOWN', detail: (e as Error).message };
  }
}
