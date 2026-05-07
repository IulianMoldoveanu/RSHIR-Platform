#!/usr/bin/env node
/**
 * i18n parity check.
 *
 * Loads `apps/restaurant-web/src/lib/i18n/dictionaries.ts` via dynamic
 * `tsx`-style transpile, walks the `ro` + `en` trees and reports:
 *   - keys present in RO but missing in EN
 *   - keys present in EN but missing in RO
 *   - keys where EN value is identical to RO (likely untranslated copy)
 *
 * Defaults to warning-only (exit 0). Pass `--strict` to exit 1 when there
 * are missing keys (reserved for the future hard-fail flip).
 *
 * Usage:
 *   node scripts/i18n-parity-check.mjs           # warning only, exit 0
 *   node scripts/i18n-parity-check.mjs --json    # machine-readable report
 *   node scripts/i18n-parity-check.mjs --strict  # exit 1 on missing keys
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const STRICT = process.argv.includes('--strict');
const JSON_MODE = process.argv.includes('--json');

const targets = [
  {
    app: 'restaurant-web',
    file: path.join(
      repoRoot,
      'apps/restaurant-web/src/lib/i18n/dictionaries.ts',
    ),
  },
];

/**
 * Extracts the inner object literal of `ro: { ... }` and `en: { ... }` from
 * the dictionaries.ts source by brace counting. We then JSON-coerce by
 * eval-ing in a sandboxed `Function` after stripping `as const` and
 * trailing-comma normalisation (so we don't need a TS toolchain in CI).
 */
function extractDicts(source) {
  function findBlock(label) {
    const re = new RegExp(`^  ${label}: \\{$`, 'm');
    const m = re.exec(source);
    if (!m) throw new Error(`block not found: ${label}`);
    let depth = 0;
    let i = m.index + m[0].length;
    const start = i;
    while (i < source.length) {
      const ch = source[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        if (depth === 0) return source.slice(start, i);
        depth--;
      }
      i++;
    }
    throw new Error(`unterminated block: ${label}`);
  }

  const roBody = findBlock('ro');
  const enBody = findBlock('en');

  function bodyToObject(body) {
    // Wrap in { } and eval as JS object literal. The dictionary source uses
    // single-quoted strings + identifier keys, both valid JS expression form.
    // eslint-disable-next-line no-new-func
    const fn = new Function(`return ({${body}\n});`);
    return fn();
  }

  return {
    ro: bodyToObject(roBody),
    en: bodyToObject(enBody),
  };
}

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

function diff(roFlat, enFlat) {
  const roKeys = new Set(Object.keys(roFlat));
  const enKeys = new Set(Object.keys(enFlat));
  const missingInEn = [...roKeys].filter((k) => !enKeys.has(k)).sort();
  const missingInRo = [...enKeys].filter((k) => !roKeys.has(k)).sort();
  const identical = [...roKeys]
    .filter((k) => enKeys.has(k) && roFlat[k] === enFlat[k] && /[a-zA-Z]/.test(String(roFlat[k])))
    .sort();
  return { missingInEn, missingInRo, identical };
}

let totalMissing = 0;
const reports = [];

for (const target of targets) {
  const src = readFileSync(target.file, 'utf8');
  const { ro, en } = extractDicts(src);
  const roFlat = flatten(ro);
  const enFlat = flatten(en);
  const d = diff(roFlat, enFlat);
  totalMissing += d.missingInEn.length + d.missingInRo.length;
  reports.push({
    app: target.app,
    file: path.relative(repoRoot, target.file),
    counts: {
      ro_keys: Object.keys(roFlat).length,
      en_keys: Object.keys(enFlat).length,
      missing_in_en: d.missingInEn.length,
      missing_in_ro: d.missingInRo.length,
      identical_strings: d.identical.length,
    },
    missing_in_en: d.missingInEn,
    missing_in_ro: d.missingInRo,
    identical_strings: d.identical,
  });
}

if (JSON_MODE) {
  process.stdout.write(JSON.stringify({ reports, totalMissing }, null, 2) + '\n');
} else {
  for (const r of reports) {
    process.stdout.write(`\n[i18n parity] ${r.app}  (${r.file})\n`);
    process.stdout.write(`  RO keys: ${r.counts.ro_keys}\n`);
    process.stdout.write(`  EN keys: ${r.counts.en_keys}\n`);
    process.stdout.write(`  Missing in EN: ${r.counts.missing_in_en}\n`);
    process.stdout.write(`  Missing in RO: ${r.counts.missing_in_ro}\n`);
    process.stdout.write(`  Identical (likely untranslated): ${r.counts.identical_strings}\n`);
    if (r.missing_in_en.length) {
      process.stdout.write('\n  --- missing in EN ---\n');
      for (const k of r.missing_in_en) process.stdout.write(`    ${k}\n`);
    }
    if (r.missing_in_ro.length) {
      process.stdout.write('\n  --- missing in RO ---\n');
      for (const k of r.missing_in_ro) process.stdout.write(`    ${k}\n`);
    }
  }
  process.stdout.write(`\nTotal missing keys: ${totalMissing}\n`);
}

if (STRICT && totalMissing > 0) {
  process.stderr.write(
    `\n[i18n parity] STRICT mode: ${totalMissing} missing keys → failing.\n`,
  );
  process.exit(1);
}

if (totalMissing > 0) {
  process.stderr.write(
    `\n[i18n parity] WARNING: ${totalMissing} missing keys (warning-only, not failing CI).\n`,
  );
}
process.exit(0);
