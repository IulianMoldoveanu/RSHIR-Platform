# HIR Restaurant Suite — UI/UX Audit

**Auditor:** Senior product designer (competitive review).
**Date:** 2026-04-26.
**Scope:** `apps/restaurant-web` (customer storefront) + `apps/restaurant-admin` (tenant dashboard) at the state of branch `fix/diacritics-encoding`.
**Goal:** ship Brașov pilot in ~45 days with a level of polish that reads as "profesionalism și eficiență" to a restaurant owner who has been comparing your demo to Glovo, Tazz, FoodPanda, and Toast.

The product is honest, fast, and structurally close to right. The single biggest gap is **visual confidence on first 3 seconds**: the storefront looks like a clean v1, not a paid SaaS. Second biggest is the **admin sidebar**, which today exposes 15 raw nav items and signals "internal tool", not "product I bought". Third is **checkout step 1 information density** — too many fields visible at once on mobile.

Everything below is mapped to file paths and Tailwind classes you can change in a single sitting per item.

---

## Executive Summary — what to fix first

1. **Collapse the admin sidebar from 15 flat items to 6 grouped sections** with icons. Today `apps/restaurant-admin/src/app/dashboard/layout.tsx:19-35` lists 15 entries (7 of them `/settings/*`) and reads as a developer view. This is the single highest-leverage polish item — every owner sees it every day.
2. **Make the storefront menu feel like a product, not a list.** Replace the horizontally-scrollable category rails (`menu-list.tsx:82-89`) with a vertical card grid + sticky category tab bar. Horizontal-only scroll forces the customer to read each category twice (once in the heading, once by swiping) and hides items below the fold.
3. **Split checkout step 1 into 3 visually-clear blocks (fulfillment → contact → address)** with a sticky "Continuă" CTA + live total. Today `CheckoutClient.tsx` shows all five sections stacked at once with a single bottom button — a known abandonment driver on mobile.
4. **Add real loading skeletons on storefront and orders queue.** The storefront has none; `TrackClient.tsx:83` shows just `<p>track.loading</p>`. The orders page reloads every render with no inflight indicator. Skeletons are 30 minutes and lift perceived speed dramatically.
5. **Tighten the visual identity in 4 hours**: a real tenant-overridable accent (extending `--hir-brand` to admin), a Romanian-friendly system font stack with a display weight at 600 instead of 700, and a single elevation system. Right now the product mixes `rounded-md` / `rounded-lg` / `rounded-xl` / `rounded-2xl` / `rounded-full` arbitrarily.

---

## Storefront (customer-facing)

### 1. Tenant home / menu listing — `apps/restaurant-web/src/app/(storefront)/page.tsx` + `menu-list.tsx`

**Current state.** A cover image header with an avatar-style logo overlap, a search field, and one horizontally-scrolling rail per category (`menu-list.tsx:82-89`). Items are 260px-wide cards (`menu-item-card.tsx:24`) with image, name, 2-line description, price, and a black pill "+" CTA. The search is the only filter. The page has no category tab bar, no badge for "popular" / "nou" / "recomandat", and no anchor jumps. Cover gradient overlay sits at `from-black/10 via-black/0 to-black/40` (`tenant-header.tsx:44`) which works on photos but flattens to muddy gray on the default `from-zinc-200 to-zinc-300` placeholder.

**Best-in-class.** Glovo, Wolt, Bolt Food and UberEats all use a **vertical list** of menu items with a **sticky category tab bar** that scrolls the page to the matching `<section>`. They reserve horizontal scroll only for marketing carousels ("Reduceri azi", "Cele mai comandate"). Bottom-reach is mandatory: the cart pill stays anchored, and tapping a category in the tab bar must be a one-thumb action. Items show a square or 4:3 image at the right of a row, not a card-grid.

**Concrete recs.**
- **P0** Replace the horizontal rail with a vertical list. Change `menu-list.tsx:82-89` from `flex snap-x ... overflow-x-auto` to `grid grid-cols-1 gap-3 px-4`. Item cards become rows: `flex flex-row` with image on the right (`h-24 w-24 rounded-xl`) and text on the left.
- **P0** Add a sticky category tab bar above the menu. New component: a `<nav class="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">` with horizontally-scrollable `<a href="#cat-{id}">` chips. Active chip = `bg-zinc-900 text-white`, inactive = `text-zinc-600`. Use IntersectionObserver in a small client component to update active state on scroll.
- **P0** Add `id="cat-{id}"` + `scroll-mt-16` to each `<section>` in `menu-list.tsx:78` so the sticky bar doesn't cover headings.
- **P1** Promote item card price hierarchy: today the price is `text-sm font-semibold` next to a same-size CTA pill. Make price `text-base font-semibold text-zinc-900` and de-weight the CTA to `text-xs font-medium` with brand purple background (use `--hir-brand`, not `bg-zinc-900`) at `menu-item-card.tsx:55-58`.
- **P1** Add a "best seller" / "nou" badge slot. Add `tags?: string[]` rendering at the top-left of the image: `<span class="absolute left-2 top-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-semibold uppercase">Top</span>`. Editable by admin in items-panel; defaults to none.
- **P1** Cover header: replace the static `from-zinc-200 to-zinc-300` placeholder (`tenant-header.tsx:33`) with a brand-tinted gradient when no cover is uploaded — `bg-gradient-to-br from-[var(--hir-brand)]/30 to-[var(--hir-brand)]/5`. Free dignity for tenants who haven't uploaded a photo yet.
- **P2** Surface "deschis până la HH:MM" + average prep time directly in the header next to the rating, not buried in a closed-banner only when closed. Customers want to see "deschis · ~25 min · 4.7★" in one row.
- **P2** Add `loading="lazy"` is already there; also add `decoding="async"` and a fixed aspect-ratio wrapper to prevent CLS on slow 3G.

### 2. Item detail page — `apps/restaurant-web/src/app/(storefront)/m/[slug]/page.tsx`

**Current state.** A 288px tall image at the top, a back chevron in a white circle, then `tenant.name` (uppercase tracking-widest in `text-zinc-500`), the item name, price, description, a WhatsApp share button, and an `<ItemDetailActions>` block (qty + add). The page bottom-pads `pb-32` (line 106) anticipating the cart pill. There is no breadcrumb back to category, no related items, no allergen list, no "ingrediente" structured area.

**Best-in-class.** UberEats and Wolt use a parallax image at the top, a fixed-bottom "Adaugă la coș · 35,00 RON" CTA that always shows the live computed price (item × qty + modifiers), and a "Recomandat alături" carousel below. Allergens render as small icons (Bolt Food does 6 standard ones).

**Concrete recs.**
- **P0** Make the qty + add CTA sticky bottom on mobile. The component lives in `<ItemDetailActions>`. Wrap it in `sticky bottom-0 -mx-4 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-0` so it free-floats above content on phones but stays inline on desktop.
- **P1** Show the live total (`price × qty + modifiers`) inside the CTA label: `Adaugă · 35,00 RON`. Today the CTA shows just "Adaugă"; the price is separate. Pricing in the button is the single highest-impact micro-pattern in delivery checkout.
- **P1** Increase the back chevron tap target. `h-9 w-9` (`page.tsx:128`) is on the edge of WCAG 2.5.5 (44×44 recommended). Bump to `h-11 w-11`.
- **P2** Add a related-items rail at the bottom: top 4 items in same category, excluding current. Reuses `<MenuItemCard>` with a one-row variant.
- **P2** If `item.tags` includes any of `picant`/`vegan`/`gluten`, render small lucide icons with tooltips. Don't ship a full allergen schema in MVP — just chips from `tags[]`.

### 3. Cart drawer — `cart-drawer.tsx`

**Current state.** Genuinely good. Bottom sticky cart pill (`fixed inset-x-4 bottom-4`, line 62) with count badge and live subtotal, opening into a bottom sheet with quantity stepper + remove. Already uses `--hir-brand` for the pill (line 62). Promo discount preview is wired (lines 161-170). This is the best-designed surface in the storefront today.

**Concrete recs.**
- **P1** The "Vezi coșul" copy is redundant with the visible subtotal pill. Replace with the most-ordered-item count: "3 produse · 45,00 RON". Already have count, just change the label format.
- **P2** Add small thumbnail in the cart pill (top-right corner cluster) for orders ≥1 unique item. Gives identity without crowding.
- **P2** Move the WhatsApp share button (`cart-drawer.tsx:194-199`) out of the cart footer. It competes with "Continuă spre checkout" — the most important CTA in the app — and lowers conversion. Better placement: tenant-header WhatsApp button is enough.
- **P2** Empty-state icon (`ShoppingBag` at line 83) is fine but the text is bare. Add a Romanian copy nudge: "Adaugă produse din meniu să continui" + a `<button>` to dismiss.

### 4. Checkout — `apps/restaurant-web/src/app/checkout/CheckoutClient.tsx`

**Current state.** Three logical steps (`form` / `review` / `payment`) shown as a numbered top progress indicator (lines 495-523). Step 1 stacks five vertically: cart summary box → fulfillment toggle (when pickup is enabled) → "Datele tale" (4 fields) → "Livrare" (4 fields) → "Mențiuni" → "Cod promo" → "Calculeaza taxa de livrare" button at the bottom. On a phone that's 7-8 screen-heights of scroll before the user can submit.

**Best-in-class.** UberEats checkout in 2026 is essentially **one screen**: a recognized customer (cookie-based), an editable address chip, a delivery-time chip, items summary, payment method chip, and a single "Plasează comanda" sticky CTA showing total. Glovo is similar. The "step 1 → step 2 → step 3" pattern reads as B2B, not consumer-grade.

**Concrete recs.**
- **P0** Make the primary CTA sticky bottom on mobile with the live total: `Calculează taxa · subtotalRon`. Today the CTA at `CheckoutClient.tsx:410-423` is at the bottom of a long form, easy to lose. Wrap in the same sticky-bottom pattern as the cart pill, `bg-[var(--hir-brand)]`. Use `safe-area-inset-bottom` padding.
- **P0** The review-step "Plătește · 47,00 RON" button (`line 442-447`) is a different style than step 1 (`px-4 py-2` vs step 1's `px-4 py-3`). Standardize: every primary CTA in checkout is `h-12 rounded-full text-base font-semibold` (matches the cart pill). Pulling button styles into `Button` variant `primaryLg` in `packages/ui` is a 30-min refactor.
- **P0** Move the cart summary (`CartSummaryBox`, line 525) to a collapsible accordion at the top — open on desktop, collapsed on mobile by default — so the form starts above the fold. On mobile the form is what the user has to do; the cart summary is reference info.
- **P1** Inline geocode feedback: today the address field uses an `onBlur={handleGeocode}` (line 360) and writes the result to a small `<p>` below ("Adresă găsită: 45.6427, 25.5887"). Coordinates are not what the customer wants to verify — the resolved street is. Show the geocoder's `display_name` instead, with a small map preview (a 64-pixel-wide static Leaflet snapshot or an OSM static-map URL).
- **P1** Step indicator (lines 495-523): the connector lines (`<span class="h-px w-6 bg-zinc-300" />`) look thin and incidental on mobile. Use a `flex-1` line + filled progress: `flex h-1 flex-1 rounded-full bg-zinc-200` with an inner `<span style={{width: pct}}>` filled with brand color.
- **P1** "Calculează taxa de livrare" is not the customer's mental model — they think "Continuă". The fact that taxa is calculated is irrelevant; the calculation should happen automatically when the address geocodes. Rename to "Continuă", and only block on missing coords.
- **P1** Promo code section (`PromoBox`) sits between notes and the CTA. Move it to a collapsible "Ai un cod promo?" link inside the cart summary — that's where Glovo/Wolt put it. Reduces visual noise for the 95% of users without a code.
- **P2** Replace the raw `<input>` (lines 344-353, etc) with the `<Input>` from `@hir/ui`. Today `inputCls` (line 474) duplicates the shadcn input style. One-time consolidation, then everything inherits future polish.
- **P2** Show a "Înapoi la meniu" persistent link at the top of step 1. Today the only escape hatch is the browser back button.

### 5. Order tracking — `apps/restaurant-web/src/app/track/[token]/TrackClient.tsx`

**Current state.** Status pill, "estimare" stub ("Vom afișa o estimare în curând" on line 110 — never replaced), pickup address OR map, products list, totals, "Sună restaurantul" button, optional cancel/review widgets. Polls every 30s (line 74). The map fallback hardcodes Brașov center (line 78).

**Best-in-class.** Glovo's tracking page is a **vertical timeline** ("Comanda primită → În preparare → La curier → Livrată") with each step glowing as it activates, paired with the live ETA at the top of the screen and the courier name + photo when assigned. UberEats does the same plus a "tip the courier" entry point post-delivery.

**Concrete recs.**
- **P0** Replace the single `StatusPill` (lines 206-233) with a **vertical timeline** showing all 6 normal steps: PENDING → CONFIRMED → PREPARING → READY → IN_DELIVERY → DELIVERED, where each completed step has a check icon and the current step has a pulsing dot. ~50 lines of JSX, no schema change. Massive perceived-quality lift.
- **P0** Replace the "Vom afișa o estimare în curând" placeholder (line 110) with an actual ETA based on `created_at + tenant prep_time + zone_tier_eta`. Even a static `25-35 min` from tenant settings beats this empty state.
- **P1** Pull the `tel:` "Sună restaurantul" button (line 167) above the totals box. After the status, calling is the second most likely action a worried customer takes — don't bury it.
- **P1** Status pill colors mix amber/emerald/rose for state — but a customer in PREPARING (today: amber) will read amber as "warning". Switch active states to brand purple (`bg-purple-100 text-purple-800`) and reserve amber for genuine warnings.
- **P2** The review widget (lines 235-329) uses raw `★` chars at `text-xl`. Replace with lucide `Star` icons at `h-8 w-8` filled with `fill-amber-400` / unfilled `text-zinc-300`. Crisper at 2x DPI and tap target grows from 40px to 44px.
- **P2** When `fulfillment === 'PICKUP'`, today there's no map, just an address text. Add the same Leaflet `<TrackMap pickup={...} dropoff={null} />` you already use for delivery. Removes a code branch and gives pickup customers a "tap to get directions" CTA.

---

## Admin dashboard

### 6. Sidebar / shell — `apps/restaurant-admin/src/app/dashboard/layout.tsx`

**Current state.** A 56px-high header logo "HIR Admin", then a flat list of 15 nav items in pill rows (lines 19-35). Items 8-15 are all `/settings/*` — flat, not nested. There are **no icons**. The active route has no visual treatment (line 48-49 just sets hover styles). The header at 65-79 has a tenant selector + logged-in email + logout. Width is `w-56` = 224px.

**Best-in-class.** Toast, Square for Restaurants, Lightspeed all collapse navigation to **5-7 top-level sections with icons**, with nested items shown as a second-level panel that slides out or as a section header. A long flat list signals "internal admin tool"; a grouped, iconified nav signals "product".

**Concrete recs.**
- **P0** Group nav into 6 sections with `lucide-react` icons. Suggested grouping:
  - `Home` (`/dashboard`) — `LayoutDashboard`
  - `Comenzi` (`/dashboard/orders`) — `Receipt`
  - `Meniu` (`/dashboard/menu`) — `BookOpen`
  - `Marketing` — `Megaphone` — children: `Coduri reducere`, `Recenzii`
  - `Operațiuni` — `Settings2` — children: `Zone livrare`, `Operațiuni`, `Notificări`
  - `Configurare` — `Cog` — children: `Identitate vizuală`, `Domeniu`, `SEO`, `Integrări`, `Jurnal acțiuni`
  - `Configurare inițială` (`/dashboard/onboarding`) — pinned at top, only when `!went_live` (today the dot indicator does this — keep that).
  Two-level nav: top-level item with icon; click expands a sub-list. Use `<details>` element for free animation, no JS.
- **P0** Add an **active-state indicator**. Today, navigating to `/dashboard/menu` doesn't highlight the link. Add: when `pathname.startsWith(item.href)` apply `bg-zinc-100 font-medium text-zinc-900` + a left-border accent `border-l-2 border-purple-600 -ml-px pl-[10px]`.
- **P1** Reduce sidebar header weight. "HIR Admin" at `text-sm font-semibold` (line 40) is competing with the nav. Replace with the small logo from `@hir/ui` (or a 24px purple square + "HIR" wordmark). The full text "HIR Admin" reads as branding for the wrong audience — owners shouldn't be reminded they're in "admin".
- **P1** Top-bar rework. The `flex h-14 items-center justify-between` (line 65) has tenant selector on the left, email + logout on the right. Add: a "Vezi storefront" link button on the right, `<a href={tenantUrl} target="_blank">` with `ExternalLink` icon. Owners constantly want to verify what customers see.
- **P2** Mobile responsiveness. The sidebar is `w-56` always — at <768px the layout breaks. Add `lg:flex hidden` on the aside and a `<button class="lg:hidden">` hamburger that toggles a `<Sheet side="left">`. Owners do check orders from their phone in the kitchen.

### 7. Dashboard home — `apps/restaurant-admin/src/app/dashboard/page.tsx`

**Current state.** Just a header (`tenant.name` + 1 line "Vezi statistici detaliate în Analytics") and the `<PolishChecklist>` card. After the polish checklist is dismissed (all 4 done) the page is **empty except for a one-line header**. No today's revenue, no orders count, no avg ticket, no inflight orders.

**Best-in-class.** Toast and Square home shows 4 KPI cards (today's revenue, orders, avg ticket, vs yesterday %), an "active orders" mini-list, and the most recent reviews. It's the page the owner opens first thing in the morning.

**Concrete recs.**
- **P0** Add 4 KPI cards above the polish checklist: `Vânzări azi`, `Comenzi azi`, `Coș mediu`, `Recenzii noi (7z)`. Each card: `rounded-lg border border-zinc-200 bg-white p-4` with metric (`text-2xl font-semibold tabular-nums`), label (`text-xs uppercase tracking-wider text-zinc-500`), and a tiny delta chip ("+12% vs ieri") in emerald or rose. The data is already in `restaurant_orders` and `reviews` — single SQL aggregation per card, server-rendered.
- **P0** Add an "Active orders" panel below KPIs — same `<ul>` rendering as `/orders` but limited to 5 most recent active. Click-through to `/dashboard/orders`.
- **P1** Replace the underlined link "Analytics" (line 25) with a proper button: "Vezi raport complet →".
- **P1** Wrap the entire page content in `max-w-6xl` so on a 27" monitor the KPI cards don't span the whole screen and look thin.
- **P2** Add a "Anunț de la HIR" slot — a small dismissible card for product updates. You'll want this when you ship Sprint 12, 13, etc. Backed by a single `tenants.dismissed_announcement_id` field.

### 8. Orders queue — `apps/restaurant-admin/src/app/dashboard/orders/page.tsx`

**Current state.** A header ("Comenzi") with `Export CSV` + filter pills (Active/Azi/Toate), then orders **grouped by status** as separate `<section>`s, each showing rows with: `#shortId`, customer name, status pill, "Ridicare" badge if pickup, total RON, time ago, "Deschide" link. Real-time updates via `<OrdersRealtime />`. The grouped sections render in fixed order: PENDING → CONFIRMED → PREPARING → READY → DISPATCHED → IN_DELIVERY → DELIVERED → CANCELLED.

**Best-in-class.** Toast, Otter, ChowNow show a **kanban view by status** for active orders, with each column scrollable independently and cards draggable for status transition. For high-volume restaurants this is the single most-requested feature. For low volume, the current grouped list is actually fine — but the grouped list's ergonomics can improve.

**Concrete recs.**
- **P0** Make every order row clickable, not just the "Deschide" link. Wrap `<li>` content in a `<Link>` (and remove the standalone "Deschide" button) — much larger tap target, especially on tablet.
- **P0** Add a row-level **time-since-paid danger threshold**. If a `PENDING` order is >5 min old, render the time-ago in `text-rose-600 font-semibold` and add a small alert dot on the left of the row. Owners should never miss a pending order.
- **P1** Show the **item count** on each row ("3 produse"). Today rows show only customer name + total. A single SQL select (`order_items` count via the same query) is enough.
- **P1** Pin a sound + browser-tab-title-flash on new PENDING orders. The realtime hook (`<OrdersRealtime />`) already runs — add `new Audio('/notification.mp3').play()` and `document.title = '🔔 (1) Comenzi'` until window is focused. This is what every Toast user expects.
- **P1** The status pills (`STATUS_PILL` map at line 40-49) are good but redundant with the section heading they're already grouped under. When grouped, drop the pill on rows. When viewing "Toate", show it. Conditional based on `filter`.
- **P2** Add a **kanban view toggle** (`Listă` / `Kanban`) for restaurants with >20 active orders. Reuses the same data, just renders 6 columns of cards. Defer this to Sprint 13 unless TEI pilot pushes it earlier.
- **P2** "Export CSV" today links to `/api/dashboard/orders/export` with no filename hint. Add `?range=90d` and let the API set `Content-Disposition: filename="comenzi-{tenant-slug}-{YYYY-MM-DD}.csv"`. Cosmetic but owners forward these to accountants.

### 9. Menu management — `items-panel.tsx`

**Current state.** A toolbar with search input (`max-w-xs`), category select, "Import CSV" / "Import AI" / "+ Produs nou" buttons. Then a table with: checkbox / image / name+tags / category / price / availability toggle / "Epuizat azi" button / edit+delete icons. Bulk actions appear when rows are selected. Toast notifications wire up.

**Best-in-class.** Toast, Square menu management uses a 2-pane layout: a left tree of categories (drag-reorderable), right pane the items in the selected category as either a list or a grid of photo cards. For phone editing, Otter does an even simpler "tap-and-edit-in-place" where price + availability are inline-editable.

**Concrete recs.**
- **P0** The "Epuizat azi" button in the table cell is too wide. On a 1280px viewport it pushes the actions column off-screen. Use a 2-state toggle icon: `<Sun>` for available, `<Moon>` for sold-out-today, `h-7 w-7 rounded-md`, with a tooltip. Saves ~120px of column width.
- **P0** Add **drag-to-reorder** for items within a category (and categories themselves on the categories tab). Customers see items in the order the admin sets — but today reordering means hand-editing `display_order` integers. Use `@dnd-kit/sortable` (already in the bundle if you've added it; otherwise a 3kb add). Persist via a new `reorderItemsAction`.
- **P1** Make the price column inline-editable. Click the price, it becomes an `<Input>` with `inputMode="decimal"`, blur saves. Reduces "edit dialog → save → reload" friction for the daily case (a price change).
- **P1** The image thumbnail at `h-10 w-10` (line 227) is too small to evaluate quality. Bump to `h-12 w-12` and on hover/focus show a 200×200 popover preview. Also add a "missing image" warning badge so owners can see at a glance which items lack photos — `MenuItemCard` looks much worse without an image, so this is an indirect storefront polish.
- **P1** "Cauta..." input has no icon. Add a `<Search>` lucide icon inside, same pattern as storefront menu search.
- **P2** Bulk action bar today (lines 171-184) is a banner that pops in. Make it a sticky bottom bar instead — same UI pattern as Gmail's "1 conversation selected" — so it doesn't push content down on scroll.
- **P2** Confirmation `confirm()` (line 115) is browser-native and looks unprofessional. Replace with the `<Dialog>` from `@hir/ui` + a destructive `<Button variant="destructive">`.

### 10. Onboarding / polish checklist — `polish-checklist.tsx`

**Current state.** A purple card (`bg-purple-50 border-purple-200`) with title + 4 items + check icons. Each item links to the relevant settings page. Hides when all items done.

This is **the single best-designed component in the admin**. Keep it. Two micro-fixes:

- **P2** Show a thin progress bar at the top of the card (`h-1 rounded-full bg-purple-100` with inner `bg-purple-600 w-{pct}%`). 5 minutes, satisfying.
- **P2** Romanian copy: "Continuă să-ți optimizezi restaurantul" is good. Consider tightening to "Optimizează-ți restaurantul" — same meaning, less ambient anxiety.

---

## Cross-cutting

### Typography

The shared preset (`packages/ui/tailwind.preset.ts`) sets the system font stack only — no display family. This is fine for MVP. **But** body and headings both default to `font-semibold` for emphasis. Consider:

- Add `Inter` or `Geist` as the variable display font via `next/font` in each app's root layout. Pass `variable: '--font-sans'` and add to the preset's `fontFamily.sans`. Zero perf cost (next/font subsets it), high polish lift.
- Standardize a 4-step type scale: `text-xs` (chrome/labels), `text-sm` (body), `text-base` (emphasis), `text-xl` (page H1) only. Today the codebase uses `text-2xl` for H1 in some places (`page.tsx:21`) and `text-xl` in others (`layout.tsx:22`). Pick one.

### Spacing & rounding

The codebase mixes `rounded-md` (buttons, inputs), `rounded-lg` (some cards), `rounded-xl` (storefront sections), `rounded-2xl` (item cards), and `rounded-full` (CTAs, pills). **Pick three and stick to them.** Suggested system:

- **Inputs, buttons, small chips:** `rounded-md` (6px)
- **Cards, sections, panels:** `rounded-xl` (12px)
- **Pill CTAs, badges, avatars:** `rounded-full`

Anything in `rounded-lg` / `rounded-2xl` should be migrated. ~20 minutes with a project-wide find-replace, double-check by eye.

### Color

Current accent is `purple-700` literally hardcoded in checkout (`CheckoutClient.tsx:413, 442`, etc), but `--hir-brand` is set on the storefront shell only (`(storefront)/layout.tsx:37`). Recommendations:

- **Promote `--hir-brand` to admin too.** Initialize from tenant branding in the admin layout the same way. Today admin uses `bg-zinc-900` for primary buttons (`button.tsx:8`). Either adopt the brand variable or document that admin is intentionally neutral. I lean **neutral admin, branded storefront** — admin is your product, not the tenant's.
- The status pill palette in orders (`STATUS_PILL`, `orders/page.tsx:40-49`) uses 7 different hue families (amber/blue/indigo/emerald/violet/purple/rose). That's too many — reduce to 4: amber=PENDING, blue=in-progress (CONFIRMED/PREPARING/READY/DISPATCHED/IN_DELIVERY), emerald=DELIVERED, rose=CANCELLED.
- Don't extend the palette beyond `purple` + `zinc` + the 3 semantic colors (`amber`, `emerald`, `rose`). Adding more hues is the most common mistake in tenant SaaS visual design.

### Iconography

Currently using `lucide-react` (good, consistent). Two cleanups:

- The custom `PencilIcon` / `TrashIcon` in `apps/restaurant-admin/src/app/dashboard/menu/icons.tsx` should be replaced with `lucide-react`'s `Pencil` / `Trash2`. Less code, perfect consistency.
- The 🍽️ emoji fallback in `menu-item-card.tsx:36` and item page (`page.tsx:123`) renders inconsistently across OS. Replace with a lucide `<UtensilsCrossed class="h-12 w-12 text-zinc-300">`.

### Empty states

`EmptyState` exists in `@hir/ui` (`packages/ui/components/ui/empty-state.tsx`) but the apps barely use it:

- Orders empty: `<div class="flex h-48 ... border border-dashed">Nicio comanda...</div>` (`orders/page.tsx:157-159`) — replace with `<EmptyState>` + an `<Receipt>` icon + "Comenzile vor apărea aici" copy + a CTA to share storefront.
- Menu items empty: bare `<p>Niciun produs.</p>` (`items-panel.tsx:188`) — same treatment, with `<BookOpen>` icon + "+ Produs nou" CTA.
- Cart drawer empty already has an icon (`ShoppingBag`) — keep, but use `<EmptyState>` for consistency.

### Loading states

This is the **second highest leverage cross-cutting fix** after typography. Today:

- Storefront menu page: blocks on server fetch, no skeleton. Use `<MenuList>` skeleton variant: 3 category headers with 3 ghost cards each. ~30 min.
- Track page: `<p>track.loading</p>` (`TrackClient.tsx:83`). Replace with skeleton timeline + skeleton items list. ~20 min.
- Orders page: server-rendered, no inflight state when filter pills change route. Add a `<LinearProgress>` component (already implementable as a `h-1 animate-pulse bg-purple-200` band).

The `<Skeleton>` component already exists in `@hir/ui`. Use it.

### Error states

Errors today are mostly `<div role="alert" class="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>` (e.g. `CheckoutClient.tsx:327-329`). Good baseline. Improvements:

- Add a `<TriangleAlert>` icon prefix.
- For network errors specifically (`!res.ok && !data.reason`), include a "Reîncearcă" button that re-runs the last action. Today users have to scroll back up and click "Calculează taxa" again.

---

## Quick wins — top 10, ≤30 min each

Ranked by polish-per-minute:

1. **Standardize all primary CTAs to `h-12 rounded-full text-base font-semibold` brand-purple.** Find-replace in `CheckoutClient.tsx:413, 442`, `track/[token]/TrackClient.tsx:169, 323`, `(storefront)/m/[slug]/page.tsx`. (15 min)
2. **Add active-route highlighting to admin sidebar** — `bg-zinc-100 + border-l-2 border-purple-600` in `dashboard/layout.tsx:48`. (10 min)
3. **Replace `<p>Loading…</p>` placeholders with `<Skeleton>` blocks** on track page and storefront. (30 min for both)
4. **Add lucide icons to admin nav items** (no grouping yet, just icons). (20 min)
5. **Replace 🍽️ emoji fallback with `<UtensilsCrossed>` lucide icon.** (5 min)
6. **Add `<Search>` icon inside menu admin search input** for symmetry with storefront. (5 min)
7. **Bump back-chevron tap target on item page** from `h-9 w-9` to `h-11 w-11`. (2 min)
8. **Replace `confirm()` calls in admin** with `<Dialog>` from `@hir/ui`. (30 min, only `items-panel.tsx:115` and `TrackClient.tsx:354`)
9. **Add KPI cards skeleton on dashboard home** even before the data — 4 `<Skeleton class="h-24 rounded-lg">` placeholders ship immediately, real data follows. (15 min)
10. **Show live total in primary checkout CTA**: change "Calculează taxa de livrare" to `Continuă · ${formatRon(cartTotal, locale)}` at `CheckoutClient.tsx:422`. (10 min)

If you do only these 10, the product feels meaningfully more finished.

---

## Bigger bets — 1+ day each

1. **Vertical menu list + sticky category tab bar.** Replaces horizontal rails on the storefront home. Affects `menu-list.tsx`, `menu-item-card.tsx`, and adds a new `<CategoryTabs>` sticky component with IntersectionObserver. Roughly 1.5 days including mobile QA across 5 categories. **Highest ROI** of any single bet. (UberEats reference: <https://www.ubereats.com/>)
2. **Admin sidebar v2 with grouped sections + icons + collapsible.** Grouping logic is straightforward; the hard part is choosing labels owners will recognize. ~1 day, including `<details>` accordion pattern, mobile sheet, and active-state styling. (Toast reference for layout: <https://pos.toasttab.com/restaurant-pos>)
3. **Order tracking timeline.** Replace the single status pill with a vertical timeline (6 steps), live ETA, and courier card when DISPATCHED. ~1 day. Schema is already there — just rendering. Massive customer-side perceived-quality lift; this is the screen customers screenshot and share.
4. **Dashboard home with live KPIs + active orders panel.** ~1.5 days including the SQL aggregations, KPI card component, and an "active orders" sub-list with realtime updates. Owners will check this 20× a day; current empty-after-onboarding home wastes that surface.
5. **One-screen checkout with sticky CTA.** Long-haul, ~2-3 days. Requires consolidating the `form/review/payment` machine and trusting the user to scroll past summary. Defer to post-pilot if 1-4 land first.

---

## What NOT to change

The following are correct decisions today — do not over-redesign them in a polish push:

- **Cart pill at bottom-fixed using `--hir-brand`.** It's exactly the right pattern. Glovo, Wolt, UberEats all converge on this. Leave it alone.
- **Numbered step indicator at top of checkout** (lines 495-523). The visual style needs an upgrade (see rec under Checkout) but the **pattern** is good — Romanian customers in 2026 are accustomed to multi-step checkouts and the indicator de-risks the flow. Don't collapse to one screen for MVP.
- **Polish checklist on dashboard home.** The single most-thoughtful piece of UX in the codebase. Don't replace it; just augment with KPI cards.
- **Status grouping on the orders queue.** Don't jump to kanban for the pilot — a low-volume Brașov restaurant with 30 orders/day will find grouped lists more readable than a 6-column kanban. Add the kanban toggle later, default to list.
- **Server-rendered orders + realtime patch.** The architecture is right — fast first paint, deltas via Supabase realtime. Don't switch to fully-client-rendered for "smoother loading"; you'd lose SEO + first-paint speed.
- **Romanian copy throughout.** Tone is mostly clear and correct. Don't run a copy refactor pass in the same sprint as visual polish — they need separate review cycles.
- **`zinc` neutral palette.** Many designers will be tempted to switch to `slate` or `neutral`. Don't. `zinc` is fine, the palette is not the problem; consistency is.
- **shadcn-style component contracts in `@hir/ui`.** The component library is small and well-named. Don't add `dark mode` support, animation libraries, or theme tokens beyond `--hir-brand` for the pilot.

---

## Reference imagery

The following are public competitor URLs verified accessible (used as design references during this audit; embed at your discretion when sharing this doc with stakeholders):

![Glovo Romania storefront menu pattern](https://glovoapp.com/ro/en/delivery_glovo/traditional/)
![Toast POS marketing — orders dashboard hero](https://pos.toasttab.com/products/online-ordering)
![DoorDash merchant portal navigation guide](https://merchants.doordash.com/en-us/learning-center/navigation)
![DoorDash menu best practices](https://merchants.doordash.com/en-us/learning-center/maximize-your-menu)

---

## Next session recommendation

In your next 90-minute design pass, knock out all 10 quick wins (they will land in a single PR and visibly raise polish), then start **Bigger Bet #2 (admin sidebar v2)** because it touches every admin route and unblocks visual-consistency improvements downstream. Schedule **Bigger Bet #1 (vertical menu + sticky tabs)** as a paired-design+dev day — it's the storefront's biggest unlock and you'll want to QA it on a real Brașov restaurant's menu data before the pilot, not after. Defer Bigger Bets #4 and #5 until you've watched the first pilot tenant use the product for a week — onboarding feedback will tell you whether the dashboard home or the checkout flow needs investment first.

---

**Sources consulted (web research):**
- [eCommerce Checkout Optimization: UX Guide 2026](https://www.digitalapplied.com/blog/ecommerce-checkout-optimization-2026-ux-guide)
- [Sticky Add-to-Cart Best Practices 2026](https://easyappsecom.com/guides/sticky-add-to-cart-best-practices)
- [Designing Sticky Menus: UX Guidelines — Smashing Magazine](https://www.smashingmagazine.com/2023/05/sticky-menus-ux-guidelines/)
- [DoorDash Merchant Portal Navigation](https://merchants.doordash.com/en-us/learning-center/navigation)
- [DoorDash — 11 Tips to Design a High-Performing Menu](https://merchants.doordash.com/en-us/learning-center/maximize-your-menu)
- [Toast Online Ordering](https://pos.toasttab.com/products/online-ordering)
- [Studying Glovo UX/UI through wireframing — Sara Gregorio](https://medium.com/@saragj92/studying-glovo-ux-ui-through-wireframing-36064c2e79ed)
- [Uber Eats UX Flow — Page Flows](https://pageflows.com/ios/products/uber-eats/)
