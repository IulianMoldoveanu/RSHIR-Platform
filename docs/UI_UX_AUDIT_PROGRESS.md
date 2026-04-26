# UI/UX Audit — Implementation Progress

Tracks the autonomous polish session against `docs/UI_UX_AUDIT.md`.
Last updated: 2026-04-26.

## Shipped (20 commits on `main`)

### Bigger bets (audit § Bigger bets)
| # | Title | Status |
|---|---|---|
| 1 | Vertical menu list + sticky category tabs | ✅ shipped — `e01ad17` |
| 2 | Admin sidebar v2 (icons + active state + mobile drawer) | ✅ partial — icons + active state + mobile sidebar shipped (`6a3425d`, `682c653`, `d2bfb23`); grouping into 6 sections with `<details>` accordion deferred |
| 3 | Order tracking timeline | ✅ shipped — `c4072a1` |
| 4 | Dashboard home with live KPIs + active orders | ✅ shipped — `6a3425d` |
| 5 | One-screen checkout | ⏳ deferred (post-pilot per audit recommendation) |

### Quick wins (audit §Quick wins)
| # | Quick win | Status |
|---|---|---|
| Q1 | Standardize primary CTAs (h-12 rounded-full purple) | ✅ `682c653`, `a6fcc75` |
| Q2 | Active-route highlight in admin sidebar | ✅ `682c653` |
| Q3 | Skeletons replace `<p>Loading…</p>` (track + storefront) | ✅ `a2db06e`, `abc9d91` |
| Q4 | Lucide icons in admin sidebar | ✅ `6a3425d` |
| Q5 | 🍽️ emoji → UtensilsCrossed lucide | ✅ `a6fcc75`, `0e4289e` |
| Q6 | Search icon in admin menu search | ✅ `78cec1f` |
| Q7 | Back-chevron `h-9 w-9` → `h-11 w-11` | ✅ `a6fcc75` |
| Q8 | confirm() → Dialog (admin + track) | ✅ `05dc359` |
| Q9 | KPI skeleton cards on dashboard home | ✅ `6a3425d` |
| Q10 | Live total in primary checkout CTA | ✅ `682c653` |

### Per-section (audit §Storefront, §Admin)
- **§1 Storefront menu:** P0 vertical list + sticky tabs ✅; P0 scroll-mt-20 sections ✅; P1 brand purple "+ Add" pill ✅; P1 brand-tinted gradient empty cover ✅. *Deferred:* P1 best-seller badge slot (needs schema), P2 "deschis · 25 min · 4.7★" header row.
- **§2 Item detail:** P0 sticky-bottom Add CTA ✅; P1 live total in CTA ✅; P1 back-chevron tap target ✅. *Deferred:* P2 related-items rail, P2 allergen chips from tags.
- **§3 Cart drawer:** P1 cart pill copy "{count} produse · {total}" ✅; P2 WhatsApp share moved out of cart footer ✅; P2 empty-state copy nudge ✅. *Deferred:* P2 cart pill thumbnail.
- **§4 Checkout:** P1 step indicator filled progress bars ✅; P1 "Continuă" copy ✅; Q10 live total ✅. *Deferred:* P0 sticky-bottom CTA on mobile, P0 cart-summary collapsible accordion, P1 inline geocode feedback (display_name not coords), P1 promo collapsible inside cart summary, P2 raw `<input>` consolidation.
- **§5 Track:** P0 vertical timeline ✅; P0 ETA ✅; P1 tel above totals ✅; P1 status colors switched to brand purple ✅; P2 ★ → lucide Star ✅. *Deferred:* P2 PICKUP map.
- **§6 Sidebar:** P0 grouping with icons (icons ✅; grouping deferred); P0 active-state indicator ✅; P1 smaller header (HIR mark + wordmark) ✅; P1 "Vezi storefront" link ✅; P2 mobile responsiveness ✅.
- **§7 Dashboard home:** P0 4 KPI cards ✅; P0 active orders panel ✅; P1 max-w-6xl wrapper ✅; P1 "Vezi raport complet →" button ✅. *Deferred:* P2 "Anunț de la HIR" slot.
- **§8 Orders queue:** P0 row-level Link wrap ✅; P0 stale-PENDING danger threshold ✅; P1 item count column ✅; P1 conditional pill (hide when grouped) ✅. *Deferred:* P1 sound + tab title flash, P2 kanban toggle, P2 CSV filename hint (already implemented earlier).
- **§9 Menu management:** P0 "Epuizat azi" → toggle icon ✅; P1 search icon ✅; P2 confirm() → Dialog ✅. *Deferred:* P0 drag-to-reorder, P1 inline-editable price, P1 image hover preview, P2 sticky bulk action bar.
- **§10 Polish checklist:** P2 progress bar ✅; P2 copy tightening ✅.

### Cross-cutting (audit §Cross-cutting)
- **Typography:** ⏳ deferred (Inter / Geist via next/font is a separate pass).
- **Spacing & rounding:** ✅ Cards standardized to rounded-xl across admin (`01013c4`).
- **Color:** ✅ STATUS_PILL palette consolidated 7→4 hue families (`05dc359`).
- **Iconography:** ✅ Custom PencilIcon/TrashIcon → lucide Pencil/Trash2 (`78cec1f`); 🍽️ → UtensilsCrossed everywhere; ★ → lucide Star in widgets and reviews moderation.
- **Empty states:** ✅ EmptyState rolled into orders, menu items, categories, modifiers, reviews, audit log, active orders panel.
- **Loading states:** ✅ TrackSkeleton, storefront route-level loading.tsx, dashboard KPI/active-orders skeletons.
- **Error states:** ✅ TriangleAlert prefix on checkout + track errors; Info icon on items-panel warning. *Partial:* "Reîncearcă" retry button on network errors not yet rolled.

## What's NOT shipped (and why)

These items are deliberately deferred or out-of-scope for an autonomous
visual polish pass:

- **§1 P1 Best-seller / nou badge** — schema work (new `tags[]` rendering with admin editor). Defer to a feature sprint.
- **§1 P2 "deschis · ~25 min · 4.7★"** — needs `prep_time_minutes` in tenant settings. Defer.
- **§4 P0 Sticky-bottom checkout CTA** — touched but not landed; needs careful mobile-Safari testing because the existing form layout already has a bottom-dependent flow. Worth its own dedicated pass.
- **§4 P0 Cart-summary collapsible** — restructures the checkout step 1 layout meaningfully. Worth a focused pass.
- **§7 P2 "Anunț de la HIR" slot** — needs `tenants.dismissed_announcement_id` field + admin-side announcement table. Schema work.
- **§8 P1 Sound + tab-title flash on PENDING** — small but needs an `/notification.mp3` asset and document.title flicker logic; nice candidate for next batch.
- **§9 P0 Drag-to-reorder** — needs `@dnd-kit/sortable` and a server action. Worth a focused pass.
- **§9 P1 Inline-editable price** — small mutation flow. Nice next batch.
- **Mobile-sidebar grouping (§6 P0 grouping):** Icons + active-state shipped; grouping items into 6 collapsible sections with `<details>` was scoped out so the flat list keeps working. Worth a separate pass with copy review.
- **Typography (Inter/Geist):** Separate pass; touches every layout root.

## Scripts / artifacts

- `docs/UI_UX_AUDIT.md` — original 70-rec audit (research deliverable).
- `docs/UI_UX_AUDIT_PROGRESS.md` — **this doc**, tracks what's done.

## Verification

```
pnpm -r typecheck    # all 9 workspace projects clean
pnpm --filter @hir/restaurant-web build    # exit 0
pnpm --filter @hir/restaurant-admin build  # exit 0 (after a clean .next on Windows
                                              due to a known Next 14.2.18 nft.json
                                              race; Vercel/Linux unaffected)
```

All 20 session commits are on `origin/main`. Vercel push-to-deploy will
take them once the daily 100-deploy quota resets.
