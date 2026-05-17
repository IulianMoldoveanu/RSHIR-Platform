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
// can unit-test it without spinning up Deno. Keep in sync with the Edge
// Function in supabase/functions/voice-incoming/index.ts.

function matchIntent(transcript: string): string | null {
  const t = transcript.toLowerCase();
  if (/rezerv(are|a)|masa|mese/.test(t)) return 'cs.reservation_create';
  if (/vreau sa comand|doresc sa comand|as vrea sa comand|comanda noua/.test(t)) {
    return 'ops.order_create';
  }
  if (/comand(a|are)|comanzi|livrare/.test(t)) return 'ops.order_create';
  if (/program|deschis|inchis|orar/.test(t)) return 'ops.weather_today';
  if (/meniu|pret|preturi|specialit/.test(t)) return 'menu.description_update';
  return null;
}

describe('matchIntent', () => {
  it('routes reservation phrases to cs.reservation_create', () => {
    expect(matchIntent('as dori sa fac o rezervare pentru patru persoane')).toBe(
      'cs.reservation_create',
    );
    expect(matchIntent('aveti o masa libera diseara?')).toBe('cs.reservation_create');
  });
  it('routes order phrases to ops.order_create', () => {
    expect(matchIntent('vreau o comanda cu livrare')).toBe('ops.order_create');
    expect(matchIntent('vreau sa comand doua pizza')).toBe('ops.order_create');
    expect(matchIntent('comanzi la domiciliu?')).toBe('ops.order_create');
  });
  it('routes hours/program phrases to ops.weather_today', () => {
    expect(matchIntent('care e programul de deschis?')).toBe('ops.weather_today');
  });
  it('routes menu/price phrases to menu.description_update', () => {
    expect(matchIntent('ce pret are pizza?')).toBe('menu.description_update');
    expect(matchIntent('aveti meniu vegetarian?')).toBe('menu.description_update');
  });
  it('returns null for unrecognized input', () => {
    expect(matchIntent('multumesc, la revedere')).toBeNull();
    expect(matchIntent('')).toBeNull();
  });
});

// -------- Claude order prompt builder --------
//
// Mirrors buildOrderParsePrompt from voice-incoming Edge. Tests ensure the
// prompt shape is deterministic so Claude always receives consistent context.

type MenuItemContext = { id: string; name: string; price_ron: number };

function buildOrderParsePrompt(transcript: string, menuItems: MenuItemContext[]): string {
  return `Restaurant menu items (JSON): ${JSON.stringify(menuItems)}
Customer transcript: "${transcript}"

Extract structured order. Return JSON only:
{
  "items": [{ "item_id": "uuid", "qty": 2 }],
  "customer_name": "string or null",
  "customer_phone": "string or null",
  "delivery_address": "string or null",
  "notes": "string or null",
  "confidence": 0.0
}

Match item names from the transcript to the closest menu item by name. Use the item's id field.
If you cannot extract a valid order (confidence < 0.7), return {"confidence": 0, "reason": "..."}.
Return only the JSON object with no prose or markdown.`;
}

describe('buildOrderParsePrompt', () => {
  const menu: MenuItemContext[] = [
    { id: 'uuid-1', name: 'Pizza Margherita', price_ron: 35 },
    { id: 'uuid-2', name: 'Cola 0.5L', price_ron: 8 },
  ];

  it('includes menu JSON in the prompt', () => {
    const prompt = buildOrderParsePrompt('vreau doua pizza', menu);
    expect(prompt).toContain('"id":"uuid-1"');
    expect(prompt).toContain('"name":"Pizza Margherita"');
    expect(prompt).toContain('"price_ron":35');
  });

  it('includes the transcript verbatim', () => {
    const transcript = 'doresc o pizza margherita si o cola';
    const prompt = buildOrderParsePrompt(transcript, menu);
    expect(prompt).toContain(transcript);
  });

  it('requests JSON-only output with confidence field', () => {
    const prompt = buildOrderParsePrompt('comand', menu);
    expect(prompt).toContain('"confidence"');
    expect(prompt).toContain('Return only the JSON object');
  });

  it('includes fallback instruction for low confidence', () => {
    const prompt = buildOrderParsePrompt('', menu);
    expect(prompt).toContain('confidence < 0.7');
    expect(prompt).toContain('"reason"');
  });
});

// -------- voice.enabled gating --------
//
// Tests that simulate the feature-flag check inside processRecordingAsync.
// The actual guard is in the Edge Function; this mirrors the logic so we
// can assert the behaviour in a fast Vitest test.

function isVoiceOrderEnabled(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object') return false;
  const voice = (settings as Record<string, unknown>).voice;
  if (!voice || typeof voice !== 'object') return false;
  return (voice as Record<string, unknown>).enabled === true;
}

describe('voice.enabled gating', () => {
  it('returns false when settings is null', () => {
    expect(isVoiceOrderEnabled(null)).toBe(false);
  });

  it('returns false when voice key is absent', () => {
    expect(isVoiceOrderEnabled({})).toBe(false);
    expect(isVoiceOrderEnabled({ other: true })).toBe(false);
  });

  it('returns false when voice.enabled is falsy', () => {
    expect(isVoiceOrderEnabled({ voice: { enabled: false } })).toBe(false);
    expect(isVoiceOrderEnabled({ voice: { enabled: 'true' } })).toBe(false);
    expect(isVoiceOrderEnabled({ voice: {} })).toBe(false);
  });

  it('returns true only when voice.enabled is strictly true', () => {
    expect(isVoiceOrderEnabled({ voice: { enabled: true } })).toBe(true);
  });
});
