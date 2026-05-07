// Lane VOICE-CHANNEL-TWILIO-SKELETON — Edge Function `voice-incoming`.
//
// Sprint 12 skeleton. End-to-end happy path:
//   1. Twilio POSTs the voice webhook here when a tenant's phone number
//      receives a call. Application/x-www-form-urlencoded body per the
//      Twilio Voice API docs.
//   2. We verify the X-Twilio-Signature header against the tenant's saved
//      Auth Token (vault) — only Twilio knows the secret, so a valid
//      signature proves the request is genuine.
//   3. If the call has a finished RecordingUrl, fetch the audio and run
//      it through OpenAI Whisper for transcription. (V1 records the call
//      and processes synchronously; V2 will move to async + Twilio's
//      <Gather> for partial-utterance detection.)
//   4. Route the transcript to the Master Orchestrator dispatcher. The
//      orchestrator returns a free-form text response.
//   5. Return TwiML: <Say> the response, then <Hangup>.
//
// Two distinct webhook shapes Twilio sends:
//   - First call: no RecordingUrl yet. We respond with TwiML that records
//     the caller's audio and points the recording-finished webhook BACK
//     here.
//   - Second call (recording finished): RecordingUrl is present. We
//     transcribe + dispatch + speak the response.
//
// Default off: a tenant only receives traffic after they paste their
// Twilio Account SID + phone number in /dashboard/settings/voice and
// configure Twilio's voice webhook URL in their Twilio console.
//
// Wrapped in withRunLog so failed calls surface in
// /dashboard/admin/observability/function-runs.
//
// CRITICAL: Twilio voice webhooks have a hard 15-second response limit
// (https://www.twilio.com/docs/usage/webhooks/webhooks-connection-overrides).
// Whisper transcription on a 30–60s caller recording can take 5–30s,
// blowing the budget. Pattern: return TwiML IMMEDIATELY and offload the
// heavy work (download recording, Whisper, dispatch, persist) to
// `EdgeRuntime.waitUntil` so it runs after the response is sent. The
// caller hears a generic acknowledgement; the call log fills in async.
// Codex P1 catch on PR #360 review.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { withRunLog } from '../_shared/log.ts';

// Deno extension: tells the runtime to keep the worker alive until the
// promise resolves, even though the HTTP response was already returned.
// Supabase Edge Functions expose this from the standard Deno runtime.
declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

// -------- Helpers --------

function twiml(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    status: 200,
    headers: { 'content-type': 'text/xml; charset=utf-8' },
  });
}

function twimlReject(message: string): Response {
  // Speak the reason, then hang up. Polly RO voice is 'Carmen'.
  const safe = escapeXml(message);
  return twiml(`<Say voice="Polly.Carmen" language="ro-RO">${safe}</Say><Hangup/>`);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Twilio sends application/x-www-form-urlencoded. Decode once.
function parseFormBody(rawBody: string): Map<string, string> {
  const params = new URLSearchParams(rawBody);
  const m = new Map<string, string>();
  for (const [k, v] of params) m.set(k, v);
  return m;
}

// Twilio signature validation per
// https://www.twilio.com/docs/usage/webhooks/webhooks-security
//
// Algorithm (X-Twilio-Signature):
//   1. Take the full request URL (scheme + host + path + query).
//   2. If application/x-www-form-urlencoded, append each param's name +
//      value (no separator) sorted alphabetically by name.
//   3. HMAC-SHA1 the resulting string with the Auth Token as key.
//   4. Base64-encode the digest. Compare constant-time to the header.
export async function validateTwilioSignature(opts: {
  url: string;
  rawBody: string;
  authToken: string;
  signature: string;
}): Promise<boolean> {
  const params = parseFormBody(opts.rawBody);
  const sortedKeys = Array.from(params.keys()).sort();
  let data = opts.url;
  for (const k of sortedKeys) data += k + (params.get(k) ?? '');
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(opts.authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  if (expected.length !== opts.signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ opts.signature.charCodeAt(i);
  }
  return diff === 0;
}

// Coarse intent matcher — keyword-based, RO-only V1. The future Sprint 14
// upgrade is to hand the full transcript to Sonnet 4.5 and ask it to pick
// from the registered intents. Skeleton stays cheap + deterministic.
export function matchIntent(transcript: string): string | null {
  const t = transcript.toLowerCase();
  if (/rezerv(are|ă|a)|masă|mese/.test(t)) return 'cs.reservation_create';
  if (/comand(ă|a|are|ă)|comanzi|livrare/.test(t)) return 'ops.orders_now';
  if (/program|deschis|închis|orar/.test(t)) return 'ops.weather_today';
  if (/meniu|preț|prețuri|specialit/.test(t)) return 'menu.description_update';
  return null;
}

// -------- Whisper transcription --------

async function transcribeAudio(opts: {
  recordingUrl: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  openAiKey: string;
}): Promise<{ text: string; durationSeconds: number | null }> {
  // Twilio recording URLs require Basic auth with the Account SID + Auth
  // Token. We download the WAV and forward it to Whisper.
  const basicAuth = btoa(`${opts.twilioAccountSid}:${opts.twilioAuthToken}`);
  const audioRes = await fetch(`${opts.recordingUrl}.wav`, {
    headers: { Authorization: `Basic ${basicAuth}` },
  });
  if (!audioRes.ok) {
    throw new Error(`twilio_recording_fetch_${audioRes.status}`);
  }
  const audioBlob = await audioRes.blob();

  const form = new FormData();
  form.append('file', audioBlob, 'recording.wav');
  form.append('model', 'whisper-1');
  form.append('language', 'ro');
  form.append('response_format', 'verbose_json');

  const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.openAiKey}` },
    body: form,
  });
  if (!whisperRes.ok) {
    const detail = await whisperRes.text().catch(() => '');
    throw new Error(`whisper_${whisperRes.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await whisperRes.json()) as {
    text?: string;
    duration?: number;
  };
  return {
    text: typeof data.text === 'string' ? data.text : '',
    durationSeconds: typeof data.duration === 'number' ? Math.round(data.duration) : null,
  };
}

// -------- Master Orchestrator dispatch --------

// Light import: shared module re-exports `dispatchIntent`. We keep the
// orchestrator interaction in this file thin so unit tests can mock the
// import without pulling in Supabase.
import { dispatchIntent } from '../_shared/master-orchestrator.ts';

async function dispatchToOrchestrator(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  tenantId: string;
  intent: string;
  transcript: string;
}): Promise<{ summary: string; data: unknown } | { error: string }> {
  const result = await dispatchIntent(opts.supabase, {
    tenantId: opts.tenantId,
    channel: 'voice',
    intent: opts.intent,
    payload: { transcript: opts.transcript },
  });
  if (!result.ok) return { error: result.error };
  if (result.state === 'PROPOSED') {
    return {
      summary: result.summary,
      data: { proposed: true, runId: result.runId },
    };
  }
  return {
    summary: typeof (result as { data?: unknown }).data === 'string'
      ? ((result as { data: string }).data)
      : 'Cererea dumneavoastră a fost înregistrată.',
    data: result.data,
  };
}

// -------- Tenant lookup by inbound phone number --------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findTenantByPhoneNumber(supabase: any, toNumber: string) {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, settings, name')
    .filter('settings->voice->>twilio_phone_number', 'eq', toNumber)
    .filter('settings->voice->>enabled', 'eq', 'true')
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('[voice-incoming] tenant lookup failed:', error.message);
    return null;
  }
  return data as { id: string; settings: Record<string, unknown>; name: string } | null;
}

// -------- Vault secret reader --------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readVaultSecret(supabase: any, name: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('hir_read_vault_secret', {
    secret_name: name,
  });
  if (error) {
    console.warn(`[voice-incoming] vault read failed for ${name}:`, error.message);
    return null;
  }
  return typeof data === 'string' && data.length > 0 ? data : null;
}

// -------- Handler --------

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return twimlReject('Metodă nepermisă.');
  }

  return withRunLog('voice-incoming', async ({ setMetadata }) => {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return twimlReject('Serviciul nu este configurat. Sunați mai târziu.');
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const rawBody = await req.text();
    const params = parseFormBody(rawBody);
    const callSid = params.get('CallSid') ?? '';
    const fromNumber = params.get('From') ?? '';
    const toNumber = params.get('To') ?? '';
    const recordingUrl = params.get('RecordingUrl');
    const recordingDuration = params.get('RecordingDuration');

    if (!callSid || !toNumber) {
      return twimlReject('Cerere invalidă.');
    }

    setMetadata({
      call_sid: callSid,
      from_number: fromNumber,
      to_number: toNumber,
      stage: recordingUrl ? 'recording_finished' : 'initial',
    });

    // Look up tenant by inbound phone number.
    const tenant = await findTenantByPhoneNumber(supabase, toNumber);
    if (!tenant) {
      return twimlReject(
        'Numărul nu este configurat. Vă rugăm verificați și sunați din nou.',
      );
    }
    setMetadata({ tenant_id: tenant.id });

    // Read vault secrets.
    const authToken = await readVaultSecret(
      supabase,
      `voice_twilio_auth_${tenant.id}`,
    );
    if (!authToken) {
      return twimlReject('Configurația vocală incompletă. Anunțați restaurantul.');
    }

    // Verify Twilio signature on EVERY request (initial + recording-finished).
    const signature = req.headers.get('x-twilio-signature') ?? '';
    if (!signature) {
      console.warn('[voice-incoming] missing x-twilio-signature header');
      return new Response('forbidden', { status: 403 });
    }
    const fullUrl = req.url; // Edge runtime gives us the full URL Twilio called.
    const sigOk = await validateTwilioSignature({
      url: fullUrl,
      rawBody,
      authToken,
      signature,
    });
    if (!sigOk) {
      console.warn('[voice-incoming] bad twilio signature');
      return new Response('forbidden', { status: 403 });
    }

    // Read the tenant's voice settings (greeting copy).
    const settings = (tenant.settings ?? {}) as Record<string, unknown>;
    const voiceSettings = (settings.voice ?? {}) as Record<string, unknown>;
    const greeting =
      typeof voiceSettings.greeting === 'string' && voiceSettings.greeting.trim().length > 0
        ? voiceSettings.greeting
        : 'Bună ziua, ați sunat la restaurant. Vă rog spuneți pe scurt cum vă putem ajuta.';

    // -------- INITIAL stage: record the caller, then re-call us --------
    if (!recordingUrl) {
      // Insert a 'received' row so the call appears in the admin UI even
      // if the recording-finished webhook never fires.
      await supabase.from('voice_calls').upsert(
        {
          tenant_id: tenant.id,
          twilio_call_sid: callSid,
          from_number: fromNumber,
          to_number: toNumber,
          status: 'received',
        },
        { onConflict: 'twilio_call_sid' },
      );

      // Record up to 60 seconds; finishOnKey '#' lets the caller cut short.
      // Twilio will POST the recording-finished event back to this same URL
      // (action attribute) with RecordingUrl populated.
      const actionUrl = escapeXml(fullUrl);
      const greetingSafe = escapeXml(greeting);
      return twiml(
        `<Say voice="Polly.Carmen" language="ro-RO">${greetingSafe}</Say>` +
          `<Record action="${actionUrl}" maxLength="60" finishOnKey="#" playBeep="true" trim="trim-silence" />` +
          `<Say voice="Polly.Carmen" language="ro-RO">Nu am primit niciun mesaj. La revedere.</Say><Hangup/>`,
      );
    }

    // -------- RECORDING-FINISHED stage: ack immediately, process async --------
    //
    // Twilio's 15s budget makes synchronous Whisper + dispatch unsafe
    // (Codex P1, PR #360). We return a generic acknowledgement TwiML
    // right away and run the heavy work in `EdgeRuntime.waitUntil` so
    // the caller never waits.

    const accountSid = String(voiceSettings.twilio_account_sid ?? '');
    const ackResponse =
      'Mulțumim pentru mesaj. Cineva de la restaurant vă va contacta în scurt timp.';
    const responseSafe = escapeXml(ackResponse);
    const twimlResponse = twiml(
      `<Say voice="Polly.Carmen" language="ro-RO">${responseSafe}</Say><Hangup/>`,
    );

    // Schedule async post-processing. Failures here are logged + recorded
    // on the voice_calls row but never break the caller's TwiML response.
    EdgeRuntime.waitUntil(
      processRecordingAsync({
        supabase,
        tenantId: tenant.id,
        callSid,
        fromNumber,
        toNumber,
        recordingUrl,
        recordingDurationSeconds: recordingDuration
          ? Number.parseInt(recordingDuration, 10) || null
          : null,
        accountSid,
        authToken,
      }),
    );

    setMetadata({
      stage_done: 'recording_acked_async_dispatched',
    });

    return twimlResponse;
  });
});

// -------- Async post-processing (runs after TwiML is returned) --------
//
// Three outcomes recorded on the voice_calls row:
//   - status='processed' + transcript + intent + response: orchestrator
//     handler accepted the dispatch.
//   - status='processed' + transcript but no intent: free-text message,
//     no handler matched. The operator reads the transcript manually.
//     This is the COMMON case at skeleton stage.
//   - status='failed' + metadata.errors: one of the upstream calls
//     (Twilio recording fetch, Whisper, dispatcher) threw. Operator
//     sees the error in the call-log UI.

type ProcessRecordingArgs = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  tenantId: string;
  callSid: string;
  fromNumber: string;
  toNumber: string;
  recordingUrl: string;
  recordingDurationSeconds: number | null;
  accountSid: string;
  authToken: string;
};

async function processRecordingAsync(args: ProcessRecordingArgs): Promise<void> {
  const errorTrace: string[] = [];
  let transcript: string | null = null;
  let durationSeconds: number | null = args.recordingDurationSeconds;
  let intent: string | null = null;
  let response: string | null = null;
  let finalStatus: 'processed' | 'failed' = 'processed';

  // OpenAI key is OPTIONAL — without it, we still record the call but
  // skip transcription. The admin UI will surface the recording URL so
  // the operator can replay it manually.
  const openAiKey = await readVaultSecret(
    args.supabase,
    `voice_openai_key_${args.tenantId}`,
  );

  if (!openAiKey) {
    errorTrace.push('openai_key_missing');
  } else if (!args.accountSid) {
    errorTrace.push('account_sid_missing');
    finalStatus = 'failed';
  } else {
    try {
      const t = await transcribeAudio({
        recordingUrl: args.recordingUrl,
        twilioAccountSid: args.accountSid,
        twilioAuthToken: args.authToken,
        openAiKey,
      });
      transcript = t.text;
      if (t.durationSeconds !== null) durationSeconds = t.durationSeconds;
      intent = matchIntent(transcript);
      if (intent) {
        const dispatchResult = await dispatchToOrchestrator({
          supabase: args.supabase,
          tenantId: args.tenantId,
          intent,
          transcript,
        });
        if ('error' in dispatchResult) {
          // Codex P2 catch (PR #360): at skeleton stage, NO production
          // handlers are registered for the voice intents (KNOWN_INTENTS
          // is documentation; registerIntent() calls land in Sprint 14).
          // Treat unknown_intent as the manual-fallback path — the
          // transcript still gets saved, the operator reads it. Real
          // dispatcher errors (handler_threw, invalid_payload) still log
          // as failed.
          if (dispatchResult.error === 'unknown_intent') {
            errorTrace.push('intent_not_yet_registered_manual_fallback');
            // Keep finalStatus='processed' and clear intent so the
            // operator UI doesn't show a half-resolved match.
            intent = null;
          } else {
            errorTrace.push(`dispatch_${dispatchResult.error}`);
            finalStatus = 'failed';
          }
        } else {
          response =
            typeof (dispatchResult as { summary?: string }).summary === 'string'
              ? (dispatchResult as { summary: string }).summary
              : null;
        }
      }
    } catch (e) {
      errorTrace.push((e as Error).message);
      finalStatus = 'failed';
    }
  }

  await args.supabase.from('voice_calls').upsert(
    {
      tenant_id: args.tenantId,
      twilio_call_sid: args.callSid,
      from_number: args.fromNumber,
      to_number: args.toNumber,
      transcript,
      intent,
      response,
      duration_seconds: durationSeconds,
      status: finalStatus,
      metadata: errorTrace.length > 0 ? { errors: errorTrace } : null,
    },
    { onConflict: 'twilio_call_sid' },
  );
}
