#!/usr/bin/env node
// render-icons.mjs — DEFERRED execution helper.
//
// PURPOSE
//   Regenerate PWA icons (192px, 512px) for each app from the master wordmark SVG,
//   with per-app accent backgrounds per HIR Brand Bible §4.1 and Brand Bible §2.3 pillar accents.
//
// WHY THIS IS NOT RUN ON main
//   1. `sharp` is not in the workspace package.json today (verified 2026-05-08).
//   2. The current wordmark in this folder is a placeholder (Inter 800 fallback,
//      no Manrope outlined paths). Generating PNGs from it would lock a fallback
//      into the repo as if it were intentional.
//   3. App Store submission is 2-4 weeks out and gated on Iulian-action,
//      not on visuals shipping today.
//
// WHEN TO RUN
//   - After the external designer delivers the real wordmark (see README.md).
//   - After `pnpm add -w sharp -D` succeeds in the workspace.
//
// USAGE
//   node assets/brand/render-icons.mjs
//
// OUTPUT
//   apps/restaurant-web/public/icon-192.png       (background #C0392B)
//   apps/restaurant-web/public/icon-512.png       (background #C0392B)
//   apps/restaurant-admin/public/icon-192.png     (background #C0392B)
//   apps/restaurant-admin/public/icon-512.png     (background #C0392B)
//   apps/restaurant-courier/public/icon-192.png   (background #26A69A — courier accent)
//   apps/restaurant-courier/public/icon-512.png   (background #26A69A)
//
// SAFETY
//   The script refuses to run if it detects "PLACEHOLDER" in the wordmark SVG.
//   Strip that comment from the SVG only after a real designer-delivered file is in place.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const wordmarkPath = resolve(__dirname, 'hir-wordmark-placeholder.svg');

const TARGETS = [
  { app: 'restaurant-web', bg: '#C0392B' },
  { app: 'restaurant-admin', bg: '#C0392B' },
  { app: 'restaurant-courier', bg: '#26A69A' },
];
const SIZES = [192, 512];

async function main() {
  const svg = await readFile(wordmarkPath, 'utf8');

  if (svg.includes('PLACEHOLDER')) {
    console.error(
      'Refusing to render: the wordmark is still a placeholder.\n' +
        'Replace assets/brand/hir-wordmark-placeholder.svg with the designer-delivered SVG\n' +
        '(strip the "PLACEHOLDER" comment) before running this script.',
    );
    process.exit(1);
  }

  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error(
      'sharp is not installed. Run: pnpm add -w sharp -D\n' +
        '(See assets/brand/README.md for the full hand-off flow.)',
    );
    process.exit(1);
  }

  for (const { app, bg } of TARGETS) {
    const outDir = resolve(repoRoot, 'apps', app, 'public');
    if (!existsSync(outDir)) {
      console.warn(`Skipping ${app}: ${outDir} does not exist.`);
      continue;
    }
    for (const size of SIZES) {
      const padding = Math.round(size * 0.18);
      const inner = size - padding * 2;
      const composite = await sharp(Buffer.from(svg))
        .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer();
      const out = resolve(outDir, `icon-${size}.png`);
      await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: bg,
        },
      })
        .composite([{ input: composite, gravity: 'center' }])
        .png()
        .toFile(out);
      console.log(`wrote ${out}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
