// Lane VOICE-CHANNEL-TWILIO-SKELETON — settings shape helpers.
//
// Lives in tenants.settings.voice (jsonb). Sensitive values (Twilio Auth
// Token, OpenAI API key for Whisper) are NOT in this jsonb — they go to
// Supabase Vault under `voice_twilio_auth_<tenant_id>` and
// `voice_openai_key_<tenant_id>`. The UI only knows whether each is
// "configured" (boolean we attach at read-time after probing the vault).

export type VoiceSettings = {
  enabled: boolean;
  twilio_account_sid: string;
  twilio_phone_number: string;
  // E.164-formatted number Twilio routes incoming calls to.
  // Stored without a leading '+' is rejected on save — keep it canonical.
  greeting: string;
  last_call_at: string | null;
};

export const DEFAULT_VOICE: VoiceSettings = {
  enabled: false,
  twilio_account_sid: '',
  twilio_phone_number: '',
  greeting: 'Bună ziua, ați sunat la restaurant. Vă rog spuneți pe scurt cum vă putem ajuta.',
  last_call_at: null,
};

export function readVoiceSettings(settings: unknown): VoiceSettings {
  if (!settings || typeof settings !== 'object') return { ...DEFAULT_VOICE };
  const v = (settings as Record<string, unknown>).voice;
  if (!v || typeof v !== 'object') return { ...DEFAULT_VOICE };
  const obj = v as Record<string, unknown>;
  return {
    enabled: obj.enabled === true,
    twilio_account_sid:
      typeof obj.twilio_account_sid === 'string' ? obj.twilio_account_sid : '',
    twilio_phone_number:
      typeof obj.twilio_phone_number === 'string' ? obj.twilio_phone_number : '',
    greeting:
      typeof obj.greeting === 'string' && obj.greeting.trim().length > 0
        ? obj.greeting
        : DEFAULT_VOICE.greeting,
    last_call_at: typeof obj.last_call_at === 'string' ? obj.last_call_at : null,
  };
}

// Twilio Account SID: starts with 'AC' followed by 32 hex chars.
const ACCOUNT_SID_RE = /^AC[0-9a-f]{32}$/i;
export function isValidAccountSid(s: string): boolean {
  return ACCOUNT_SID_RE.test(s.trim());
}

// E.164 phone number: '+' followed by 1-15 digits.
const E164_RE = /^\+[1-9]\d{1,14}$/;
export function isValidPhoneNumber(s: string): boolean {
  return E164_RE.test(s.trim());
}

// Twilio Auth Token: 32 hex chars (no prefix).
const AUTH_TOKEN_RE = /^[0-9a-f]{32}$/i;
export function isValidAuthToken(s: string): boolean {
  return AUTH_TOKEN_RE.test(s.trim());
}

// OpenAI API key: starts with 'sk-' followed by 20+ alphanumeric/dash chars.
// Length range observed: 51 (legacy) to 200+ (sk-proj-...).
const OPENAI_KEY_RE = /^sk-[A-Za-z0-9_-]{20,}$/;
export function isValidOpenAiKey(s: string): boolean {
  return OPENAI_KEY_RE.test(s.trim());
}

// Greeting copy: keep short (Polly TTS reads it on every call). 1–280 chars.
export function isValidGreeting(s: string): boolean {
  const t = s.trim();
  return t.length >= 1 && t.length <= 280;
}

// Cost estimator surfaced in the admin UI. Per Twilio pricing 2026-05:
//   - RO inbound voice: ~$0.013/min
//   - Polly TTS via <Say>: bundled at ~$0.04/min on top of inbound
//   - Whisper (OpenAI): $0.006/min of audio
// We round generously to give the operator a worst-case figure rather than
// a marketing-friendly best-case.
export function estimateMonthlyCostUsd(callsPerMonth: number, avgSeconds: number): number {
  if (callsPerMonth <= 0 || avgSeconds <= 0) return 0;
  const minutes = (callsPerMonth * avgSeconds) / 60;
  // 0.013 (inbound) + 0.04 (TTS) + 0.006 (Whisper) ≈ 0.06 USD/min, round up.
  return Math.round(minutes * 0.06 * 100) / 100;
}
