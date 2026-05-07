// Unit tests for voice settings helpers + intent matcher.
//
// The Twilio signature validator and dispatcher live in the Edge Function
// (Deno runtime, can't be imported by Vitest); tests for those live in
// supabase/functions/voice-incoming/__tests__ and run under Deno.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VOICE,
  estimateMonthlyCostUsd,
  isValidAccountSid,
  isValidAuthToken,
  isValidGreeting,
  isValidOpenAiKey,
  isValidPhoneNumber,
  readVoiceSettings,
} from './voice';

describe('readVoiceSettings', () => {
  it('returns defaults for null/undefined/empty', () => {
    expect(readVoiceSettings(null)).toEqual(DEFAULT_VOICE);
    expect(readVoiceSettings(undefined)).toEqual(DEFAULT_VOICE);
    expect(readVoiceSettings({})).toEqual(DEFAULT_VOICE);
    expect(readVoiceSettings({ voice: null })).toEqual(DEFAULT_VOICE);
  });

  it('reads enabled flag and trims fields', () => {
    const got = readVoiceSettings({
      voice: {
        enabled: true,
        twilio_account_sid: 'AC00000000000000000000000000000000',
        twilio_phone_number: '+40312345678',
        greeting: 'Salut',
        last_call_at: '2026-05-08T10:00:00Z',
      },
    });
    expect(got.enabled).toBe(true);
    expect(got.twilio_phone_number).toBe('+40312345678');
    expect(got.greeting).toBe('Salut');
    expect(got.last_call_at).toBe('2026-05-08T10:00:00Z');
  });

  it('falls back to default greeting when blank', () => {
    const got = readVoiceSettings({ voice: { greeting: '   ' } });
    expect(got.greeting).toBe(DEFAULT_VOICE.greeting);
  });

  it('coerces non-boolean enabled to false', () => {
    const got = readVoiceSettings({ voice: { enabled: 'yes' } });
    expect(got.enabled).toBe(false);
  });
});

describe('isValidAccountSid', () => {
  it('accepts AC + 32 hex chars', () => {
    expect(isValidAccountSid('AC00000000000000000000000000000000')).toBe(true);
    expect(isValidAccountSid('ACFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')).toBe(true);
  });
  it('rejects non-AC prefix or wrong length', () => {
    expect(isValidAccountSid('AB1234567890abcdef1234567890abcdef')).toBe(false);
    expect(isValidAccountSid('AC123')).toBe(false);
    expect(isValidAccountSid('')).toBe(false);
  });
});

describe('isValidPhoneNumber', () => {
  it('accepts E.164', () => {
    expect(isValidPhoneNumber('+40312345678')).toBe(true);
    expect(isValidPhoneNumber('+15551234567')).toBe(true);
  });
  it('rejects without leading +', () => {
    expect(isValidPhoneNumber('40312345678')).toBe(false);
  });
  it('rejects + followed by 0', () => {
    expect(isValidPhoneNumber('+0312345678')).toBe(false);
  });
});

describe('isValidAuthToken', () => {
  it('accepts 32 hex chars', () => {
    expect(isValidAuthToken('1234567890abcdef1234567890abcdef')).toBe(true);
  });
  it('rejects short or non-hex', () => {
    expect(isValidAuthToken('12345')).toBe(false);
    expect(isValidAuthToken('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')).toBe(false);
  });
});

describe('isValidOpenAiKey', () => {
  it('accepts sk- prefix with sufficient body', () => {
    expect(isValidOpenAiKey('sk-abcdef1234567890ABCDEF12345678')).toBe(true);
    expect(isValidOpenAiKey('sk-proj-AbCdEf123_456-789012345678901234567890')).toBe(true);
  });
  it('rejects unprefixed or too short', () => {
    expect(isValidOpenAiKey('abcdef')).toBe(false);
    expect(isValidOpenAiKey('sk-short')).toBe(false);
  });
});

describe('isValidGreeting', () => {
  it('accepts non-empty up to 280 chars', () => {
    expect(isValidGreeting('Bună ziua')).toBe(true);
    expect(isValidGreeting('a'.repeat(280))).toBe(true);
  });
  it('rejects empty or too long', () => {
    expect(isValidGreeting('')).toBe(false);
    expect(isValidGreeting('   ')).toBe(false);
    expect(isValidGreeting('a'.repeat(281))).toBe(false);
  });
});

describe('estimateMonthlyCostUsd', () => {
  it('returns 0 for zero usage', () => {
    expect(estimateMonthlyCostUsd(0, 30)).toBe(0);
    expect(estimateMonthlyCostUsd(100, 0)).toBe(0);
  });
  it('scales linearly with calls × seconds', () => {
    // 100 calls × 30 s = 3000 s = 50 min × 0.06 USD/min = 3.00 USD
    expect(estimateMonthlyCostUsd(100, 30)).toBeCloseTo(3.0, 2);
    // 1000 calls × 60 s = 60000 s = 1000 min × 0.06 = 60.00 USD
    expect(estimateMonthlyCostUsd(1000, 60)).toBeCloseTo(60.0, 2);
  });
});

// -------- Intent matcher (mirrors the function in voice-incoming Edge) --------
//
// The Edge Function's matcher is duplicated here as a pure helper so we
// can unit-test it without spinning up Deno. Keep these in sync — both
// files are <100 LOC.

function matchIntent(transcript: string): string | null {
  const t = transcript.toLowerCase();
  if (/rezerv(are|ă|a)|masă|mese/.test(t)) return 'cs.reservation_create';
  if (/comand(ă|a|are|ă)|comanzi|livrare/.test(t)) return 'ops.orders_now';
  if (/program|deschis|închis|orar/.test(t)) return 'ops.weather_today';
  if (/meniu|preț|prețuri|specialit/.test(t)) return 'menu.description_update';
  return null;
}

describe('matchIntent', () => {
  it('routes reservation phrases to cs.reservation_create', () => {
    expect(matchIntent('aș dori să fac o rezervare pentru patru persoane')).toBe(
      'cs.reservation_create',
    );
    expect(matchIntent('aveți o masă liberă disearǎ?')).toBe(
      'cs.reservation_create',
    );
  });
  it('routes order phrases to ops.orders_now', () => {
    expect(matchIntent('vreau o comandă cu livrare')).toBe('ops.orders_now');
  });
  it('routes hours/program phrases to ops.weather_today', () => {
    // weather_today is the read-only catch-all the skeleton wires; Sprint 14
    // replaces it with a dedicated 'ops.opening_hours'.
    expect(matchIntent('care e programul de deschis?')).toBe('ops.weather_today');
  });
  it('routes menu/price phrases to menu.description_update', () => {
    expect(matchIntent('ce preț are pizza?')).toBe('menu.description_update');
    expect(matchIntent('aveți meniu vegetarian?')).toBe('menu.description_update');
  });
  it('returns null for unrecognized input', () => {
    expect(matchIntent('mulțumesc, la revedere')).toBeNull();
    expect(matchIntent('')).toBeNull();
  });
});
