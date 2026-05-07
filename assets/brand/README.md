# Brand assets — placeholder

> **These are throwaway placeholders.** They exist so the mobile shells (Capacitor) and PWA manifests have *something* to reference during development. Replace before App Store / Google Play submission.

## What lives here

| File | Purpose | Replace before |
|---|---|---|
| `hir-wordmark-placeholder.svg` | The single source-of-truth wordmark. Inter 800 lowercase, `#C0392B` body, `#F4A261` accent dot on the `i`. | App Store / Play submission. |
| `render-icons.mjs` | Deferred PNG render script. Not executed on `main`. Run manually after `sharp` is installed and a real wordmark exists. | — |

## Why placeholders

- HIR is pre-revenue. Iulian's reinvestment trigger for design budget is **15-20 live tenants** (locked 2026-05-08, see `MEMORY.md`). At today's count we are not there yet.
- App Store submission is **2-4 weeks out** and gated on Iulian's $99 Apple Developer + $25 Google Play purchases plus signing certs, not on visuals.
- Wave 5 is live. Mobile-shell assets are visibility prep, not a P0 unblock.

## When the designer arrives

Budget: **€200-400** on Fiverr / Dribbble / 99designs. Brief lives in `Desktop/HIR-Strategic/HIR-Brand-Bible-2026-05-08.md` §2.5 + §4. Three hand-off requirements:

1. Wordmark in **Manrope 800** outlined paths (no font embedding, no live `<text>`).
2. Romanian breve diacritic (the curved mark from `ă`) replacing the dot of the `i` — subtle "we are RO" signal per Brand Bible §2.5.
3. Three locked variants: color (default), monochrome `#1A1A1A`, reverse white-on-cărămidă.

After delivery, replace these three files in this folder, then run `node assets/brand/render-icons.mjs` to regenerate per-app PWA icons.

## Color palette (from Brand Bible §4.1)

| Token | Hex | Use here |
|---|---|---|
| `brand-primary` (cărămidă) | `#C0392B` | Wordmark body, web + admin app icon background. |
| `brand-accent` (pâine) | `#F4A261` | Dot on `i`. |
| `pillar-courier-accent` | `#26A69A` | Courier app icon accent overlay (deferred until sharp + designer pass). |
| `neutral-50` (warm white) | `#FAFAF7` | Background on light mode. |

## Typography (from Brand Bible §4.2)

| Role | Font | Where used |
|---|---|---|
| Display / wordmark | **Manrope 800** | Logo (designer pass). |
| Placeholder fallback | **Inter 800** | Current SVG — no font embedding, system Inter or sans-serif fallback. |
| Body | Inter 400-600 | UI copy. |
| Mono | JetBrains Mono | Order IDs, sums. |

## What was deliberately deferred

- **PNG icon regeneration** (`apps/*/public/icon-{192,512}.png`) — `sharp` is not in the workspace `package.json`. Existing PNGs from the repo's prior state remain in place. Add `sharp` and re-run `render-icons.mjs` once a real wordmark exists.
- **App Store 1024×1024 icon** — generated at submission time with the real wordmark, not now.
- **Splash screens with taglines** — taglines are A/B-test pool per Brand Bible §5.2; baking one into a PNG creates stale-asset risk.
- **`apple-touch-icon.png`, multi-size favicons** — same rationale: defer until designer pass.
- **Capacitor config edits** — assets path will change after designer pass; touching `capacitor.config.ts` now creates churn.

## Iulian-action when designer delivers

1. Drop the three new SVGs into this folder, overwriting `hir-wordmark-placeholder.svg` (rename to `hir-wordmark.svg`).
2. `pnpm add -w sharp -D` (workspace dev dep).
3. `node assets/brand/render-icons.mjs` — regenerates `apps/{restaurant-web,restaurant-admin,restaurant-courier}/public/icon-{192,512}.png` and adds `1024.png` for stores.
4. Commit on a `chore/brand-assets-final-vN` branch, PR, merge.

That is the whole hand-off. Total designer-side time after delivery: **≤30 minutes** from PR open to deploy.
