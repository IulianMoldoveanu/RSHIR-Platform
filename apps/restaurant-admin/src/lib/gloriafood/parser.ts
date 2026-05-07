// Pure GloriaFood CSV parser. Extracted from
// `app/dashboard/onboarding/migrate-from-gloriafood/actions.ts` so vitest
// can stress-test header detection / CSV quirks / encoding edge cases
// without touching Supabase auth or `getActiveTenant`.
//
// GloriaFood's "Export menu" feature produces a CSV with rows representing
// every menu line item. The exact columns differ slightly between exports
// (and between operators who relabel before export). The canonical English
// set is:
//   Category, Item, Description, Price, Image URL
//
// We accept English + Romanian header variants and normalize them via
// `normalize()`. We also accept comma OR semicolon delimiters (RO operators
// often re-save the export from Excel which writes ;).

export type Headers = Record<string, number>;

export const HEADER_ALIASES: Record<string, string[]> = {
  category: ['category', 'category_name', 'categorie', 'cat'],
  name: ['item', 'item_name', 'name', 'product', 'produs', 'nume'],
  description: ['description', 'descriere', 'desc'],
  price: ['price', 'pret', 'pret_ron', 'price_ron'],
  image_url: ['image', 'image_url', 'imagine'],
};

export function normalize(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '');
}

export function detectHeaders(headerRow: string[]): Headers {
  const map: Headers = {};
  headerRow.forEach((raw, idx) => {
    const norm = normalize(raw);
    for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(norm) && map[canonical] === undefined) {
        map[canonical] = idx;
      }
    }
  });
  return map;
}

// Detect the field delimiter from the first non-quoted line. RO operators
// who re-save GloriaFood's CSV from Excel often get `;` as the delimiter
// because Excel-RO uses `;` when the system locale's decimal separator is
// `,` (to avoid ambiguity). We pick the delimiter that appears more often
// in the first physical line OUTSIDE quoted regions; ties go to `,`.
//
// IMPORTANT: this fixes the previous bug where rows like
//   Item,Price
//   Burger,25,50
// were split into 3 columns, mis-parsing the price. With auto-detection,
// the header "Item,Price" forces delimiter=`,`, then `25,50` is correctly
// read as a single string field, and parsePrice() converts `25,50` → 25.5.
// Real GloriaFood exports use `.` decimals (US format) so this only
// affects RO-relabeled exports — but those exist in the wild.
export function detectDelimiter(text: string): ',' | ';' {
  let commas = 0;
  let semis = 0;
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') break;
    if (ch === '"') {
      // toggle quote, accounting for escaped ""
      if (inQuotes && text[i + 1] === '"') {
        i += 1; // skip escaped quote
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (ch === ',') commas += 1;
    else if (ch === ';') semis += 1;
  }
  return semis > commas ? ';' : ',';
}

// Tiny RFC-4180-ish CSV parser. Avoids pulling a dependency for one use site.
// Handles quoted fields, embedded commas, escaped quotes (""), and a single
// delimiter (auto-detected from the first line — see detectDelimiter).
// UTF-8 BOM is stripped by the caller via `stripBom`.
export function parseCsv(text: string, delimiter: ',' | ';' = ','): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      cur.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = '';
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

// GloriaFood prices arrive in many shapes:
//   "12.50"      → 12.50
//   "12,50"      → 12.50  (RO comma decimal)
//   "12.50 RON"  → 12.50
//   "12,50 lei"  → 12.50
//   " 12.50 "    → 12.50
//   "1.250,00"   → 1250.00 (RO thousands . decimal ,)
//   "1,250.00"   → 1250.00 (EN thousands , decimal .)
//   ""           → null    (caller flags as "Preț neidentificabil")
//   "0"          → 0       (free items — caller flags)
//   "abc"        → null
//   "-5"         → null    (negative rejected)
export function parsePrice(raw: string | undefined): number | null {
  if (!raw) return null;
  let s = raw
    .trim()
    .replace(/\s/g, '')
    .replace(/RON|LEI|lei|ron/g, '');

  // Detect ambiguous "1.250,00" vs "1,250.00" by counting separators.
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    // Whichever appears LAST is the decimal separator.
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastComma > lastDot) {
      // Comma is decimal → drop dots (thousands).
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Dot is decimal → drop commas (thousands).
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Only comma → treat as decimal separator (RO convention).
    s = s.replace(',', '.');
  }
  // Only dot or neither → as-is.

  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

// Strip UTF-8 BOM (﻿) if present at start of file.
export function stripBom(text: string): string {
  if (text.length > 0 && text.charCodeAt(0) === 0xfeff) return text.slice(1);
  return text;
}

export type ParsedItem = {
  category: string;
  name: string;
  description: string;
  price_ron: number;
  flagged: string | null; // null = clean; string = warning reason
  external_id?: string; // GloriaFood item id for idempotent re-import (Master Key path only)
};

export type ParseSuccess = {
  ok: true;
  itemCount: number;
  categoryCount: number;
  items: ParsedItem[];
  warnings: string[]; // non-fatal notices for the operator UI
};

export type ParseFailure = { ok: false; error: string };

export type ParseResult = ParseSuccess | ParseFailure;

export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_NAME_LEN = 200;
export const MAX_DESC_LEN = 1000;

// Pure CSV → ParseResult. No auth, no DB. Caller wraps with auth + tenant
// scope. The `csvText` parameter is already-decoded UTF-8 (caller is
// responsible for decoding Windows-1250 / latin1 if needed — see
// docs/migration/GLORIAFOOD_MIGRATION.md).
export function parseGloriaFoodCsvText(csvText: string): ParseResult {
  if (!csvText || csvText.trim().length === 0) {
    return { ok: false, error: 'CSV gol.' };
  }
  if (csvText.length > MAX_CSV_BYTES) {
    return { ok: false, error: 'CSV depășește 5 MB.' };
  }

  const cleaned = stripBom(csvText);
  const delimiter = detectDelimiter(cleaned);
  const rows = parseCsv(cleaned, delimiter);
  if (rows.length < 2) {
    return { ok: false, error: 'CSV trebuie să aibă header + cel puțin un rând.' };
  }

  const headers = detectHeaders(rows[0]);
  if (headers.name === undefined || headers.price === undefined) {
    return {
      ok: false,
      error:
        'CSV-ul trebuie să conțină cel puțin coloanele "Item Name" și "Price". Verifică că ai exportat din GloriaFood folosind opțiunea "Export menu".',
    };
  }

  const items: ParsedItem[] = [];
  const warnings: string[] = [];
  let truncatedNameCount = 0;
  let zeroPriceCount = 0;
  let unparseablePriceCount = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rawName = (row[headers.name] ?? '').trim();
    if (rawName.length === 0) continue; // skip blank rows

    const priceRaw = row[headers.price];
    const price = parsePrice(priceRaw);

    let flagged: string | null = null;
    if (price === null) {
      flagged = 'Preț neidentificabil — verifică manual';
      unparseablePriceCount += 1;
    } else if (price === 0) {
      flagged = 'Preț 0 — verifică manual';
      zeroPriceCount += 1;
    }

    let name = rawName;
    if (name.length > MAX_NAME_LEN) {
      name = name.slice(0, MAX_NAME_LEN);
      flagged = flagged ?? 'Numele depășește 200 caractere — trunchiat';
      truncatedNameCount += 1;
    }

    items.push({
      category:
        headers.category !== undefined
          ? (row[headers.category] ?? 'Necategorisit').trim() || 'Necategorisit'
          : 'Necategorisit',
      name,
      description:
        headers.description !== undefined
          ? (row[headers.description] ?? '').trim().slice(0, MAX_DESC_LEN)
          : '',
      price_ron: price ?? 0,
      flagged,
    });
  }

  if (items.length === 0) {
    return { ok: false, error: 'Niciun produs valid găsit în CSV.' };
  }

  if (truncatedNameCount > 0) {
    warnings.push(`${truncatedNameCount} produse cu nume trunchiat la 200 caractere.`);
  }
  if (zeroPriceCount > 0) {
    warnings.push(`${zeroPriceCount} produse cu preț 0 — verificați manual.`);
  }
  if (unparseablePriceCount > 0) {
    warnings.push(`${unparseablePriceCount} produse cu preț neidentificabil — vor fi importate dezactivate.`);
  }

  const categoryCount = new Set(items.map((i) => i.category)).size;
  return { ok: true, itemCount: items.length, categoryCount, items, warnings };
}
