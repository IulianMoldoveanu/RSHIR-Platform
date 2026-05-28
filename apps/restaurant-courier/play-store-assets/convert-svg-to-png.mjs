#!/usr/bin/env node
/**
 * Convert all SVG assets to PNG sizes required by Google Play Store.
 *
 * Usage:
 *   1. cd apps/restaurant-courier/play-store-assets
 *   2. npm install --no-save sharp
 *   3. node convert-svg-to-png.mjs
 *
 * Output: PNG-uri rezultate sunt scrise lângă SVG-urile sursă, cu același nume.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch (e) {
  console.error('\n[ERROR] sharp nu este instalat.');
  console.error('Rulează: npm install --no-save sharp');
  console.error('Apoi rerulează acest script.\n');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));

const jobs = [
  // App icons
  { src: 'icons/icon-master.svg',  out: 'icons/icon-512.png', w: 512, h: 512 },
  { src: 'icons/icon-512.svg',     out: 'icons/icon-512.png', w: 512, h: 512 },
  { src: 'icons/icon-192.svg',     out: 'icons/icon-192.png', w: 192, h: 192 },
  { src: 'icons/icon-96.svg',      out: 'icons/icon-96.png',  w: 96,  h: 96 },
  { src: 'icons/icon-48.svg',      out: 'icons/icon-48.png',  w: 48,  h: 48 },
  { src: 'icons/adaptive-bg.svg',  out: 'icons/adaptive-bg.png', w: 108, h: 108 },

  // Feature graphic
  { src: 'feature-graphic.svg',    out: 'feature-graphic.png', w: 1024, h: 500 },

  // Screenshots
  { src: 'screenshots/screenshot-1-orders-feed.svg',  out: 'screenshots/screenshot-1-orders-feed.png',  w: 1080, h: 1920 },
  { src: 'screenshots/screenshot-2-order-detail.svg', out: 'screenshots/screenshot-2-order-detail.png', w: 1080, h: 1920 },
  { src: 'screenshots/screenshot-3-gps-tracking.svg', out: 'screenshots/screenshot-3-gps-tracking.png', w: 1080, h: 1920 },
  { src: 'screenshots/screenshot-4-earnings.svg',     out: 'screenshots/screenshot-4-earnings.png',     w: 1080, h: 1920 },
  { src: 'screenshots/screenshot-5-hepi-chat.svg',    out: 'screenshots/screenshot-5-hepi-chat.png',    w: 1080, h: 1920 },
  { src: 'screenshots/screenshot-6-shift-active.svg', out: 'screenshots/screenshot-6-shift-active.png', w: 1080, h: 1920 },
];

let ok = 0;
let fail = 0;

for (const job of jobs) {
  const srcPath = join(__dirname, job.src);
  const outPath = join(__dirname, job.out);
  try {
    const svg = await readFile(srcPath);
    await sharp(svg, { density: 300 })
      .resize(job.w, job.h, { fit: 'fill' })
      .png({ quality: 95, compressionLevel: 9 })
      .toFile(outPath);
    console.log(`OK   ${job.src} -> ${job.out} (${job.w}x${job.h})`);
    ok++;
  } catch (err) {
    console.error(`FAIL ${job.src}: ${err.message}`);
    fail++;
  }
}

console.log(`\nDone. ${ok} OK, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
