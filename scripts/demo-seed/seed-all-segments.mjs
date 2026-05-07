// Master seeder — runs all 4 segment scripts in sequence and prints a summary.
//
// Each segment is its own sandbox tenant; the scripts are independent (no
// shared state). We run them sequentially to keep Supabase Mgmt API rate
// limiting predictable.
//
// Usage:
//   node scripts/demo-seed/seed-all-segments.mjs --dry-run
//   node scripts/demo-seed/seed-all-segments.mjs
//   node scripts/demo-seed/seed-all-segments.mjs --reset

import { spawn } from 'node:child_process';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SEGMENTS = [
  { script: 'pizzerie-mica.mjs', slug: 'demo-pizzerie-mica', city: 'Brașov' },
  { script: 'fast-food-activ.mjs', slug: 'demo-fast-food-activ', city: 'București' },
  { script: 'restaurant-familial.mjs', slug: 'demo-restaurant-familial', city: 'Brașov' },
  { script: 'cofetarie.mjs', slug: 'demo-cofetarie', city: 'Cluj' },
];

const passthrough = argv.slice(2);

async function runScript(script) {
  return new Promise((resolve, reject) => {
    const path = join(__dirname, script);
    const proc = spawn(process.execPath, [path, ...passthrough], {
      stdio: 'inherit',
      env: process.env,
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

console.log('[seed-all-segments] starting — args: ' + (passthrough.join(' ') || '(none)'));
console.log('[seed-all-segments] segments to seed:');
for (const s of SEGMENTS) {
  console.log(`  - ${s.script.padEnd(28)} → tenant ${s.slug} (${s.city})`);
}
console.log('');

const t0 = Date.now();
for (const s of SEGMENTS) {
  console.log(`\n=== ${s.script} ===`);
  try {
    await runScript(s.script);
  } catch (err) {
    console.error(`[seed-all-segments] FAILED on ${s.script}: ${err.message}`);
    exit(1);
  }
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

console.log('');
console.log('==========================================================');
console.log(`[seed-all-segments] all 4 segments seeded in ${elapsed}s`);
console.log('Admin tenant URLs (assuming admin.hir.ro):');
for (const s of SEGMENTS) {
  console.log(`  ${s.slug}:  https://admin.hir.ro/dashboard?tenant=${s.slug}`);
}
console.log('Storefront URLs (assuming wildcard host routing):');
for (const s of SEGMENTS) {
  console.log(`  ${s.slug}:  https://${s.slug}.hir.ro/`);
}
console.log('');
console.log('Cleanup: node scripts/demo-seed/cleanup-all-segments.mjs');
exit(0);
