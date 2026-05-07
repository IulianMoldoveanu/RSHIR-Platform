// Lane HEPY-RESERVATION-BOOKING — vitest coverage for the natural-language
// reservation parser that lives in
// `supabase/functions/_shared/reservation-parser.ts`.
//
// The module is pure (no Deno.* / no network), so vitest can import it
// directly across the supabase/ → apps/ boundary. We use a fixed clock
// (`NOW`) so relative phrases ("mâine", "vineri") have a deterministic
// expected output across CI runs and timezones.

import { describe, expect, it } from 'vitest';
import {
  parseReservation,
  missingFields,
} from '../../../../../supabase/functions/_shared/reservation-parser';

// Wednesday 2026-05-13 12:00:00 UTC = 15:00 Bucharest (DST). Wednesday
// (dow=3) is convenient because it lets us cover "vineri" (+2 days),
// "luni" (+5), "duminica" (+4), "miercuri" (+0/+7), "marti" (+6) easily.
const NOW = new Date('2026-05-13T12:00:00Z');

// Convenience factory so each test reads in one line.
function P(input: string) {
  return parseReservation(input, NOW);
}

describe('parseReservation — date', () => {
  it('parses "azi"', () => {
    expect(P('rezerva pentru 4 persoane azi la 19:00').date).toBe('2026-05-13');
  });

  it('parses "astazi" (no diacritics)', () => {
    expect(P('rezervare astazi 20:00').date).toBe('2026-05-13');
  });

  it('parses "mâine" (with diacritics)', () => {
    expect(P('rezerva mâine la 19:00').date).toBe('2026-05-14');
  });

  it('parses "maine" (no diacritics)', () => {
    expect(P('rezerva maine la 19:00').date).toBe('2026-05-14');
  });

  it('parses "poimâine"', () => {
    expect(P('rezerva poimâine la 20:00').date).toBe('2026-05-15');
  });

  it('parses "tomorrow"', () => {
    expect(P('book a table tomorrow at 7pm').date).toBe('2026-05-14');
  });

  it('parses weekday "vineri"', () => {
    // NOW is Wed 2026-05-13. Vineri = Friday = 2026-05-15.
    expect(P('rezerva vineri la 19:00').date).toBe('2026-05-15');
  });

  it('parses weekday "duminica"', () => {
    // NOW Wed → Sun = 2026-05-17.
    expect(P('rezerva duminica la 13:00').date).toBe('2026-05-17');
  });

  it('parses weekday "friday" (en)', () => {
    expect(P('book friday at 8pm').date).toBe('2026-05-15');
  });

  it('parses DD.MM future date with implicit current year', () => {
    expect(P('rezerva pentru 1.06 la 19:00').date).toBe('2026-06-01');
  });

  it('parses DD/MM/YYYY', () => {
    expect(P('rezerva 15/07/2026 la 20:00').date).toBe('2026-07-15');
  });

  it('parses YYYY-MM-DD', () => {
    expect(P('rezerva 2026-08-21 la 19:30').date).toBe('2026-08-21');
  });

  it('parses month-name RO "1 iunie"', () => {
    expect(P('rezerva 1 iunie la 19:00').date).toBe('2026-06-01');
  });

  it('parses month-name RO with year "15 iulie 2027"', () => {
    expect(P('rezerva 15 iulie 2027 la 20:00').date).toBe('2027-07-15');
  });

  it('parses month-name EN "june 1"', () => {
    expect(P('book june 1 at 7pm').date).toBe('2026-06-01');
  });

  it('rolls past DD.MM to next year when no explicit year', () => {
    // 1.04 is before 2026-05-13 → should resolve to 2027-04-01.
    expect(P('rezerva 1.04 la 19:00').date).toBe('2027-04-01');
  });

  it('returns null when no date hint', () => {
    expect(P('vreau o masa pentru 4 persoane').date).toBeNull();
  });
});

describe('parseReservation — time', () => {
  it('parses 24h "19:00"', () => {
    expect(P('rezerva mâine la 19:00').time).toBe('19:00');
  });

  it('parses 24h with single digit hour "9:30"', () => {
    expect(P('rezerva mâine la 9:30').time).toBe('09:30');
  });

  it('parses "ora 19"', () => {
    expect(P('rezerva mâine ora 19').time).toBe('19:00');
  });

  it('parses "la 21"', () => {
    expect(P('rezerva mâine la 21').time).toBe('21:00');
  });

  it('parses am/pm "7pm"', () => {
    expect(P('book tomorrow 7pm').time).toBe('19:00');
  });

  it('parses am/pm with minutes "7:30 pm"', () => {
    expect(P('book tomorrow 7:30 pm').time).toBe('19:30');
  });

  it('parses am "9 am"', () => {
    expect(P('book tomorrow 9 am').time).toBe('09:00');
  });

  it('parses colloquial "7 seara"', () => {
    expect(P('rezerva mâine 7 seara').time).toBe('19:00');
  });

  it('parses colloquial "9 dimineata"', () => {
    expect(P('rezerva mâine 9 dimineata').time).toBe('09:00');
  });

  it('parses colloquial "12 pranz"', () => {
    expect(P('rezerva mâine 12 pranz').time).toBe('12:00');
  });

  it('returns null when no time hint', () => {
    expect(P('rezerva mâine pentru 4 persoane').time).toBeNull();
  });
});

describe('parseReservation — party size', () => {
  it('parses "pentru 4 persoane"', () => {
    expect(P('rezerva pentru 4 persoane mâine 19:00').party_size).toBe(4);
  });

  it('parses "4 persoane"', () => {
    expect(P('rezerva mâine 19:00, 4 persoane').party_size).toBe(4);
  });

  it('parses "for 6 people"', () => {
    expect(P('book a table for 6 people tomorrow 7pm').party_size).toBe(6);
  });

  it('parses "masa de 8"', () => {
    expect(P('rezerva masa de 8 mâine 20:00').party_size).toBe(8);
  });

  it('parses word number "pentru patru"', () => {
    expect(P('rezerva pentru patru mâine 19:00').party_size).toBe(4);
  });

  it('returns null when no party size hint', () => {
    expect(P('rezerva mâine la 19:00').party_size).toBeNull();
  });
});

describe('parseReservation — phone', () => {
  it('parses "telefon 0712345678"', () => {
    expect(P('telefon 0712345678').phone).toBe('0712345678');
  });

  it('parses "tel: 0712 345 678"', () => {
    expect(P('tel: 0712 345 678').phone).toBe('0712345678');
  });

  it('parses "+40 712 345 678"', () => {
    expect(P('telefon +40 712 345 678').phone).toBe('+40712345678');
  });

  it('parses bare RO mobile in long sentence', () => {
    expect(P('rezerva mâine 19:00, 4 persoane, 0712345678, nume Iulian').phone).toBe('0712345678');
  });

  it('returns null when no phone', () => {
    expect(P('rezerva mâine 19:00, 4 persoane').phone).toBeNull();
  });
});

describe('parseReservation — first name', () => {
  it('parses "nume Iulian"', () => {
    expect(P('rezerva mâine 19:00, nume Iulian').first_name).toBe('Iulian');
  });

  it('parses "numele Andrei Popescu" (two words)', () => {
    expect(P('rezerva mâine 19:00, numele Andrei Popescu').first_name).toBe('Andrei Popescu');
  });

  it('parses "name John"', () => {
    expect(P('book tomorrow 7pm, name John').first_name).toBe('John');
  });

  it('parses "pe numele lui Mihai"', () => {
    expect(P('rezervare mâine 20:00 pe numele lui Mihai').first_name).toBe('Mihai');
  });

  it('preserves diacritics in name', () => {
    expect(P('rezerva mâine 19:00, nume Ștefan').first_name).toBe('Ștefan');
  });

  it('returns null when no name keyword', () => {
    expect(P('rezerva mâine 19:00, 4 persoane').first_name).toBeNull();
  });
});

describe('parseReservation — full one-liner', () => {
  it('extracts every field from the spec example', () => {
    const r = P(
      'rezervă masă pentru 4 persoane mâine la 19:00, telefon 0712345678, nume Iulian'
    );
    expect(r.date).toBe('2026-05-14');
    expect(r.time).toBe('19:00');
    expect(r.party_size).toBe(4);
    expect(r.phone).toBe('0712345678');
    expect(r.first_name).toBe('Iulian');
    expect(missingFields(r)).toEqual([]);
  });

  it('extracts every field from an English one-liner', () => {
    const r = P(
      'book a table for 6 people tomorrow at 8pm, phone +40712345678, name John Doe'
    );
    expect(r.date).toBe('2026-05-14');
    expect(r.time).toBe('20:00');
    expect(r.party_size).toBe(6);
    expect(r.phone).toBe('+40712345678');
    expect(r.first_name).toBe('John Doe');
    expect(missingFields(r)).toEqual([]);
  });

  it('returns missing fields list for partial input', () => {
    const r = P('rezerva mâine la 19:00');
    expect(r.date).toBe('2026-05-14');
    expect(r.time).toBe('19:00');
    expect(missingFields(r)).toContain('party_size');
    expect(missingFields(r)).toContain('phone');
    expect(missingFields(r)).toContain('first_name');
  });

  it('handles input with no recognised fields', () => {
    const r = P('blah blah blah');
    expect(missingFields(r)).toHaveLength(5);
  });
});

describe('parseReservation — robustness', () => {
  it('handles empty input without throwing', () => {
    expect(() => P('')).not.toThrow();
    expect(P('').date).toBeNull();
  });

  it('caps very long input', () => {
    const long = 'a'.repeat(2000) + ' rezerva mâine 19:00';
    // Inputs over 500 chars are truncated, so the trailing reservation
    // snippet is intentionally dropped — defensive cap.
    expect(P(long).time).toBeNull();
  });

  it('does not match phone-shaped numbers as date', () => {
    // 0712345678 contains "1.2" subsequences but the phone keyword takes priority.
    const r = P('telefon 0712345678 mâine 19:00');
    expect(r.phone).toBe('0712345678');
    expect(r.date).toBe('2026-05-14');
  });
});

describe('parseReservation — Codex P2 round 4 fixes', () => {
  it('does NOT extract party_size from a date "pentru 1.06"', () => {
    // This used to silently become party_size=1 because the generic
    // "pentru <number>" form caught the day component of a DD.MM date.
    const r = P('rezerva pentru 1.06 la 19:00, telefon 0712345678, nume Iulian');
    expect(r.date).toBe('2026-06-01');
    expect(r.party_size).toBeNull();
  });

  it('still extracts party_size when a guest noun is present after "pentru"', () => {
    const r = P('rezerva pentru 5 persoane la 19:00');
    expect(r.party_size).toBe(5);
  });

  it('rejects calendar-impossible 31.02', () => {
    expect(P('rezerva 31.02 la 19:00').date).toBeNull();
  });

  it('rejects calendar-impossible 30.02', () => {
    expect(P('rezerva 30.02 la 19:00').date).toBeNull();
  });

  it('rejects 32.05 (out of day range)', () => {
    // The day-range regex caps at [12]\d|3[01] (= max 31), so 32 will not
    // match the date pattern at all and the parser falls through to null.
    expect(P('rezerva 32.05 la 19:00').date).toBeNull();
  });

  it('rejects 31.04 (April has 30 days)', () => {
    expect(P('rezerva 31.04 la 19:00').date).toBeNull();
  });

  it('still accepts 31.05 (May has 31 days)', () => {
    expect(P('rezerva 31.05 la 19:00').date).toBe('2026-05-31');
  });

  it('rejects 29.02 in non-leap year (2027)', () => {
    expect(P('rezerva 29.02.2027 la 19:00').date).toBeNull();
  });

  it('accepts 29.02 in leap year (2028)', () => {
    expect(P('rezerva 29.02.2028 la 19:00').date).toBe('2028-02-29');
  });
});

describe('parseReservation — DST boundary (Codex P2 round 3)', () => {
  // Winter (January 2026): Bucharest = UTC+2. UTC 21:30 → Bucharest 23:30,
  // still the same calendar day. A naïve +3h offset would push it to
  // 00:30 the NEXT day and "azi" would resolve to tomorrow.
  it('winter UTC 21:30 stays on same Bucharest day', () => {
    const winterLateUtc = new Date('2026-01-15T21:30:00Z');
    const r = parseReservation('rezerva azi la 22:00', winterLateUtc);
    expect(r.date).toBe('2026-01-15'); // not 2026-01-16
  });

  // Summer (July 2026): Bucharest = UTC+3. UTC 21:30 → Bucharest 00:30
  // NEXT day. Tested for symmetry — confirms the new code keeps DST
  // behaviour where the prior fixed +3h was already correct.
  it('summer UTC 21:30 advances Bucharest day', () => {
    const summerLateUtc = new Date('2026-07-15T21:30:00Z');
    const r = parseReservation('rezerva azi la 22:00', summerLateUtc);
    expect(r.date).toBe('2026-07-16');
  });

  it('winter "mâine" resolves correctly at the late-evening boundary', () => {
    const winterLateUtc = new Date('2026-01-15T21:30:00Z');
    const r = parseReservation('rezerva mâine 19:00', winterLateUtc);
    expect(r.date).toBe('2026-01-16');
  });
});
