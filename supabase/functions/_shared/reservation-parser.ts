// Lane HEPY-RESERVATION-BOOKING — Romanian + English natural-language
// parser for the Hepy /rezerva intent.
//
// Pure module. No Deno. No network. No Supabase. Side-effect free; safe to
// import from any runtime (Edge Function via .ts extension, Vitest from
// apps/restaurant-admin via relative path).
//
// The parser is deliberately rule-based:
//   - Deterministic — same input → same output, easy to unit-test.
//   - Free — no Anthropic call, ~zero CPU per message.
//   - Sufficient — the dialog covers ≈ 95% of phrasings Romanian
//     restaurant operators forward us. The remaining tail falls back to
//     the step-by-step dialog (parser returns missing fields, bot asks).
//
// Output shape:
//   {
//     date: 'YYYY-MM-DD' | null,    // local calendar day in Bucharest
//     time: 'HH:MM'      | null,    // 24h, local Bucharest
//     party_size: number | null,
//     phone: string      | null,    // normalised to digits + leading '+' if intl
//     first_name: string | null,
//     notes: string      | null,
//   }
//
// The bot composes a `requested_at` timestamptz from (date + time) using
// Europe/Bucharest as the local zone; that conversion is intentionally
// NOT done here so the parser stays time-agnostic and easy to test.

export interface ParsedReservation {
  date: string | null;
  time: string | null;
  party_size: number | null;
  phone: string | null;
  first_name: string | null;
  notes: string | null;
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function stripDiacritics(s: string): string {
  return s
    .normalize('NFD')
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[̀-ͯ]/g, '');
}

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

function fmtDate(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

// Today/tomorrow are computed from a caller-supplied "now" so the parser
// is testable with a fixed clock. Defaults to real now() when omitted.
//
// NOTE: we treat the calendar boundary in Europe/Bucharest. Server time
// in Supabase Edge Functions is UTC. To keep the parser pure (no Intl
// timezone API), we apply EU DST math: Bucharest is UTC+3 from the last
// Sunday of March 03:00 local until the last Sunday of October 04:00
// local, and UTC+2 the rest of the year. The same rule lives in the
// Edge Function (`bucharestLocalToUtcIso`) for symmetry.
//
// Codex P2 (round 3): the prior `+3h` constant produced a one-day-off
// "azi" between 21:00 and 21:59 UTC in winter (i.e. 23:00-23:59
// Bucharest). The DST-aware version below removes that bug.
function bucharestOffsetHours(utc: Date): number {
  const y = utc.getUTCFullYear();
  // Last Sunday of a given month, 0-indexed, returned as UTC midnight.
  const lastSundayUtc = (year: number, monthIdx: number): Date => {
    const last = new Date(Date.UTC(year, monthIdx + 1, 0));
    const lastDow = last.getUTCDay();
    return new Date(Date.UTC(year, monthIdx, last.getUTCDate() - lastDow));
  };
  // Approximate the DST boundary at UTC midnight; the off-by-one-hour
  // window (01:00-02:00 UTC on those Sundays) is acceptable for a
  // calendar-day computation that is then confirmed by the Edge Function.
  const dstStart = lastSundayUtc(y, 2); // March
  const dstEnd = lastSundayUtc(y, 9);   // October
  const inDst = utc.getTime() >= dstStart.getTime() && utc.getTime() < dstEnd.getTime();
  return inDst ? 3 : 2;
}

function bucharestNow(now: Date): { y: number; m: number; d: number; dow: number } {
  const offsetH = bucharestOffsetHours(now);
  const ms = now.getTime() + offsetH * 3600 * 1000;
  const t = new Date(ms);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    dow: t.getUTCDay(), // 0 = Sunday
  };
}

function addDaysUtc(y: number, m: number, d: number, days: number): { y: number; m: number; d: number } {
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

// ────────────────────────────────────────────────────────────────────────
// Date parsing
// ────────────────────────────────────────────────────────────────────────
// Recognised forms (all case-insensitive, diacritics-optional):
//   relative: azi / astazi / today / mâine / maine / tomorrow /
//             poimâine / poimaine / day after tomorrow
//   weekday:  luni / marti / miercuri / joi / vineri / sambata / duminica
//             (English: monday..sunday). Resolves to the NEXT occurrence
//             from `now`.
//   numeric:  DD.MM[.YYYY] / DD/MM[/YYYY] / DD-MM[-YYYY] / YYYY-MM-DD
//   month-name: "1 iunie" / "15 iulie 2026" / "june 1" / "july 15 2026"

const RO_WEEKDAYS: Record<string, number> = {
  duminica: 0, sunday: 0,
  luni: 1, monday: 1,
  marti: 2, tuesday: 2,
  miercuri: 3, wednesday: 3,
  joi: 4, thursday: 4,
  vineri: 5, friday: 5,
  sambata: 6, saturday: 6,
};

const RO_MONTHS: Record<string, number> = {
  ianuarie: 1, ian: 1, january: 1, jan: 1,
  februarie: 2, feb: 2, february: 2,
  martie: 3, mar: 3, march: 3,
  aprilie: 4, apr: 4, april: 4,
  mai: 5, may: 5,
  iunie: 6, iun: 6, june: 6, jun: 6,
  iulie: 7, iul: 7, july: 7, jul: 7,
  august: 8, aug: 8,
  septembrie: 9, sep: 9, sept: 9, september: 9,
  octombrie: 10, oct: 10, october: 10,
  noiembrie: 11, nov: 11, november: 11,
  decembrie: 12, dec: 12, december: 12,
};

function parseDate(t: string, now: Date): string | null {
  const today = bucharestNow(now);

  // Relative — checked first because they're cheap and unambiguous.
  if (/\b(azi|astazi|today)\b/.test(t)) {
    return fmtDate(today.y, today.m, today.d);
  }
  if (/\b(maine|tomorrow)\b/.test(t)) {
    const r = addDaysUtc(today.y, today.m, today.d, 1);
    return fmtDate(r.y, r.m, r.d);
  }
  if (/\b(poimaine|day\s+after\s+tomorrow)\b/.test(t)) {
    const r = addDaysUtc(today.y, today.m, today.d, 2);
    return fmtDate(r.y, r.m, r.d);
  }

  // Weekday — "vineri" / "next friday". Resolves to NEXT occurrence; if
  // today IS that weekday, we still resolve to today (operator can re-issue).
  for (const [name, dow] of Object.entries(RO_WEEKDAYS)) {
    const re = new RegExp(`\\b${name}\\b`);
    if (re.test(t)) {
      let delta = (dow - today.dow + 7) % 7;
      // "next <weekday>" → at least 7 days out.
      if (/\bnext\s+/.test(t) || /\bsaptamana\s+viitoare\b/.test(t)) {
        if (delta === 0) delta = 7;
        else delta += 7;
      }
      const r = addDaysUtc(today.y, today.m, today.d, delta);
      return fmtDate(r.y, r.m, r.d);
    }
  }

  // YYYY-MM-DD
  let m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) {
    return fmtDate(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  // DD.MM(.YYYY) / DD/MM(/YYYY) / DD-MM(-YYYY)
  // Restrict day to 1-31 and month to 1-12 to avoid matching phone numbers.
  m = t.match(/\b(0?[1-9]|[12]\d|3[01])[.\/\-](0?[1-9]|1[0-2])(?:[.\/\-](\d{2,4}))?\b/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = m[3] ? Number(m[3]) : today.y;
    if (year < 100) year += 2000;
    // If the resulting date is in the past with no explicit year, roll to next year.
    if (!m[3]) {
      const candidate = new Date(Date.UTC(year, month - 1, day));
      const todayUtc = new Date(Date.UTC(today.y, today.m - 1, today.d));
      if (candidate.getTime() < todayUtc.getTime()) year += 1;
    }
    return fmtDate(year, month, day);
  }

  // "1 iunie" / "1 iunie 2026" / "june 1" / "june 1 2026"
  m = t.match(/\b(0?[1-9]|[12]\d|3[01])\s+([a-z]+)(?:\s+(\d{4}))?\b/);
  if (m && RO_MONTHS[m[2]]) {
    const day = Number(m[1]);
    const month = RO_MONTHS[m[2]];
    let year = m[3] ? Number(m[3]) : today.y;
    if (!m[3]) {
      const candidate = new Date(Date.UTC(year, month - 1, day));
      const todayUtc = new Date(Date.UTC(today.y, today.m - 1, today.d));
      if (candidate.getTime() < todayUtc.getTime()) year += 1;
    }
    return fmtDate(year, month, day);
  }
  m = t.match(/\b([a-z]+)\s+(0?[1-9]|[12]\d|3[01])(?:\s+(\d{4}))?\b/);
  if (m && RO_MONTHS[m[1]]) {
    const day = Number(m[2]);
    const month = RO_MONTHS[m[1]];
    let year = m[3] ? Number(m[3]) : today.y;
    if (!m[3]) {
      const candidate = new Date(Date.UTC(year, month - 1, day));
      const todayUtc = new Date(Date.UTC(today.y, today.m - 1, today.d));
      if (candidate.getTime() < todayUtc.getTime()) year += 1;
    }
    return fmtDate(year, month, day);
  }

  return null;
}

// ────────────────────────────────────────────────────────────────────────
// Time parsing
// ────────────────────────────────────────────────────────────────────────
// Recognised forms:
//   24h: "19:00" / "9:30" / "ora 19" / "la 9"
//   am/pm: "7pm" / "7 pm" / "9 am"
//   colloquial: "7 seara" / "9 dimineata" / "12 pranz" / "8 noaptea"
function parseTime(t: string): string | null {
  // 7pm / 7 pm / 7 p.m. / 7:30 pm — checked BEFORE the 24h regex so
  // "7:30 pm" doesn't get classified as 07:30.
  let m = t.match(/\b(0?[1-9]|1[0-2])(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/);
  if (m) {
    let h = Number(m[1]);
    const min = m[2] ?? '00';
    const pm = /p/i.test(m[3]);
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
    return `${pad2(h)}:${min}`;
  }

  // colloquial "7 seara" / "8 noaptea" / "9 dimineata" / "12 pranz" — also
  // checked before 24h to avoid "7:30 seara" → 07:30.
  m = t.match(/\b(0?[1-9]|1[0-2])(?:[:.](\d{2}))?\s*(seara|noaptea|dimineata|pranz)\b/);
  if (m) {
    let h = Number(m[1]);
    const min = m[2] ?? '00';
    const part = m[3];
    if (part === 'seara' || part === 'noaptea') {
      if (h < 12) h += 12;
    } else if (part === 'dimineata') {
      if (h === 12) h = 0;
    } else if (part === 'pranz') {
      // 12 pranz = 12:00, "1 pranz" = 13:00 (rare but support it)
      if (h !== 12 && h < 12) h += 12;
    }
    return `${pad2(h)}:${min}`;
  }

  // "ora 19" / "la 19" / "at 19"
  m = t.match(/\b(?:ora|la|at)\s+([01]?\d|2[0-3])(?:[:.](\d{2}))?\b/);
  if (m) {
    const h = Number(m[1]);
    const min = m[2] ?? '00';
    return `${pad2(h)}:${min}`;
  }

  // Bare 24h "19:00" / "9:30" / "19.00" — fallback after am/pm + colloquial
  // so we don't accidentally swallow "7:30 pm" as 07:30.
  m = t.match(/\b([01]?\d|2[0-3])[:..]([0-5]\d)\b/);
  if (m) return `${pad2(Number(m[1]))}:${m[2]}`;

  return null;
}

// ────────────────────────────────────────────────────────────────────────
// Party size
// ────────────────────────────────────────────────────────────────────────
const RO_NUMBER_WORDS: Record<string, number> = {
  unu: 1, una: 1, one: 1,
  doi: 2, doua: 2, two: 2,
  trei: 3, three: 3,
  patru: 4, four: 4,
  cinci: 5, five: 5,
  sase: 6, six: 6,
  sapte: 7, seven: 7,
  opt: 8, eight: 8,
  noua: 9, nine: 9,
  zece: 10, ten: 10,
  unsprezece: 11, eleven: 11,
  doisprezece: 12, douasprezece: 12, twelve: 12,
};

function parsePartySize(t: string): number | null {
  // "pentru 4 persoane" / "for 4 people" / "4 persoane" / "masa de 6"
  let m = t.match(/\b(?:pentru|for|masa\s+de|table\s+for|de)\s+(\d{1,3})\b/);
  if (m) return Number(m[1]);
  m = t.match(/\b(\d{1,3})\s*(?:persoane|persoana|pers|people|person|guests|oameni)\b/);
  if (m) return Number(m[1]);
  // word numbers
  for (const [w, n] of Object.entries(RO_NUMBER_WORDS)) {
    const re = new RegExp(`\\b(?:pentru|for|masa\\s+de|table\\s+for|de)\\s+${w}\\b|\\b${w}\\s*(?:persoane|persoana|people|person|guests)\\b`);
    if (re.test(t)) return n;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────
// Phone (RO landline + mobile + intl)
// ────────────────────────────────────────────────────────────────────────
// We accept:
//   07XXxxxxxx (10 digits, mobile)
//   021xxxxxxx / 03xxxxxxxx (landline, 10 digits)
//   +40 7XX xxxxxx (intl)
//   any 9-15 digit run preceded by "telefon"/"phone"/"tel" keyword
function parsePhone(t: string): string | null {
  // Explicit "telefon 0712..." form first — least false-positive.
  let m = t.match(/\b(?:telefon|phone|tel|nr|numar)\s*[:.\-]?\s*(\+?[\d\s().\-]{7,20})/);
  if (m) return normalisePhone(m[1]);

  // RO mobile/landline standalone (10 digits starting with 0, or +40 form).
  m = t.match(/\+40\s*\d(?:[\s\-.]?\d){8}\b/);
  if (m) return normalisePhone(m[0]);
  m = t.match(/\b0\d(?:[\s\-.]?\d){8}\b/);
  if (m) return normalisePhone(m[0]);

  return null;
}

function normalisePhone(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length < 7 || digits.length > 15) return '';
  return hasPlus ? '+' + digits : digits;
}

// ────────────────────────────────────────────────────────────────────────
// First name (after "nume X" / "numele X" / "name X" / "pe numele X")
// ────────────────────────────────────────────────────────────────────────
function parseFirstName(original: string): string | null {
  // We use the ORIGINAL casing for the name (so we don't return all-lowercase).
  // Allow Romanian + Latin letters and a single optional dash/space cluster.
  // Stop at end-of-string or a punctuation/preposition the user might use after.
  const m = original.match(/\b(?:numele|nume|name|on\s+the\s+name\s+of|pe\s+numele(?:\s+lui)?)\s+([A-Za-zĂÂÎȘȚăâîșțȘȚșț][A-Za-zĂÂÎȘȚăâîșțȘȚșț\-]{0,40}(?:\s+[A-Z][A-Za-zĂÂÎȘȚăâîșțȘȚșț\-]{0,40})?)/);
  if (!m) return null;
  // Trim trailing comma/period that a regex might have absorbed.
  return m[1].replace(/[.,;:!?]+$/, '').trim();
}

// ────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────

/**
 * Parse a one-liner Romanian / English reservation request into structured
 * fields. Any field that could not be inferred is null — the caller decides
 * whether to ask the user for it (step-by-step dialog) or to reject.
 *
 * @param input    Raw text from Telegram (the bot strips the leading
 *                 "/rezerva " prefix before calling).
 * @param now      "Now" for relative-date resolution. Defaults to real
 *                 system time but can be injected for testability.
 */
export function parseReservation(input: string, now: Date = new Date()): ParsedReservation {
  const original = (input ?? '').slice(0, 500); // hard cap, defensive
  const lower = stripDiacritics(original.toLowerCase());

  return {
    date: parseDate(lower, now),
    time: parseTime(lower),
    party_size: parsePartySize(lower),
    phone: parsePhone(lower),
    first_name: parseFirstName(original),
    notes: null,
  };
}

/**
 * Returns the list of fields still required to commit the booking. Used by
 * the Telegram bot to ask the next question in the step-by-step dialog.
 */
export function missingFields(parsed: ParsedReservation): Array<keyof ParsedReservation> {
  const out: Array<keyof ParsedReservation> = [];
  if (!parsed.date) out.push('date');
  if (!parsed.time) out.push('time');
  if (!parsed.party_size) out.push('party_size');
  if (!parsed.phone) out.push('phone');
  if (!parsed.first_name) out.push('first_name');
  return out;
}
