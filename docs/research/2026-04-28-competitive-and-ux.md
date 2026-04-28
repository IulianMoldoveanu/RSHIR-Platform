# Competitive landscape & UX backlog — HIR Restaurant Suite

Date: 2026-04-28. Author: research session. Scope: RO market, B2B restaurants, 0% commission positioning.

---

## Section 1 — Romanian competitive landscape

### Glovo
- **Commission**: 20–30% on order value, ranging 15–35% depending on city/volume. Pickup commissions typically lower than delivery ([Menuviel guide, 2025](https://blog.menuviel.com/glovo-fees-and-commissions-for-restaurants/); [Growdash RO 101](https://www.mygrowdash.com/blog/glovo-101-the-essential-guide-for-restaurants-in-romania)).
- **Delivery model**: Aggregator with own fleet of gig couriers. Romania is Glovo's #3 market globally; in 2025 RO led SE Europe in order count ([ecopolitic, 2025](https://ecopolitic.ro/retrospectiva-glovo-2025-romania-lider-in-europa-de-sud-est-la-numarul-de-comenzi-un-bucurestean-comanda-in-medie-de-cinci-ori-pe-zi/)).
- **Onboarding friction**: Sales-led, contract negotiation, fiscal docs (CUI, IBAN, food authorisation). Days–weeks. Exclusivity clauses are now banned in RO post-foodpanda absorption ([recursive.com](https://therecursive.com/online-food-delivery-integration-glovo-acquires-foodpanda-in-romania-and-bulgaria/)).
- **HIR exploit**: Glovo brand competes for customer loyalty against the restaurant. HIR's white-label storefront keeps the customer relationship with the venue.
- **Strength HIR lacks**: Demand engine — millions of MAU and search-driven discovery. HIR storefronts have no organic traffic.

### Bolt Food
- **Commission**: Launched in RO 2020 at ~22% (lowest at the time); now 15–30% by deal ([Romania Insider, 2020](https://www.romania-insider.com/bolt-food-delivery-launch-may-2020); [Menuviel Bolt Food guide](https://blog.menuviel.com/bolt-food-fees-and-commissions-for-restaurants/)).
- **Delivery model**: Aggregator + gig fleet shared with Bolt ride-hailing.
- **Onboarding**: Self-serve portal, but contract + RO fiscal docs + menu upload. Several days.
- **Exploit**: Limited city coverage outside Bucharest/Cluj/Timișoara — small chains in tier-2 cities are underserved.
- **HIR lacks**: Cross-product retention loop (Bolt rides → Bolt Food cross-promo).

### Tazz (now Wolt)
- **Commission**: Tazz historically ~20–25%; rolled into Wolt in 2025. Wolt RO: no public RO rate, EU norm 17–30% ([Menuviel Wolt guide](https://blog.menuviel.com/wolt-fees-and-commissions-for-restaurants/)).
- **Delivery model**: Aggregator. Wolt acquired Tazz from eMAG Jan 2025; full transition incl. Bucharest done by end of May 2025 across 35 cities ([Wolt press, 2025](https://press.wolt.com/en-WW/245944-wolt-completes-the-acquisition-of-romanian-local-commerce-platform-tazz/); [Romania Insider, Apr 2025](https://www.romania-insider.com/wolt-replace-tazz-romania-april-2025)).
- **Onboarding**: Self-serve sign-up at `explore.wolt.com/en/rou/merchant/business/restaurants`; menu QA before going live.
- **Exploit**: Migration churn — restaurants forced to re-sign Wolt contracts in mid-2025; many are open to alternatives during platform fatigue.
- **HIR lacks**: Polished consumer iOS/Android apps with installed base + push-notification reach.

### FoodPanda RO
- **Status**: Exited. Acquired by Glovo May 2021; brand wound down ([economedia.ro](https://economedia.ro/foodpanda-dispare-oficial-din-romania.html)).
- **Commission (historical)**: ~25–30%.
- **Relevance**: Their ex-merchants are now on Glovo; some are unhappy with consolidation and represent a re-acquisition pool.

### Wolt
- **Commission**: Public guides cite 17–30% EU-wide; RO unspecified ([Menuviel Wolt guide](https://blog.menuviel.com/wolt-fees-and-commissions-for-restaurants/)).
- **Delivery model**: Aggregator + gig fleet. Replaced Tazz in RO, May 2025.
- **Onboarding**: Self-serve, "no fees to join" per their merchant landing.
- **Exploit**: Brand-new in RO outside ex-Tazz catalogue → marketing budget burning, restaurants get courted but lose pricing power once the land-grab ends.
- **HIR lacks**: Ops maturity (15-min ETA accuracy, courier density).

### Summary table

| Player | Commission | Strength HIR lacks | Gap HIR can fill |
|---|---|---|---|
| Glovo | 20–30% | Nationwide demand engine, brand | 0% commission + restaurant owns customer data |
| Bolt Food | 15–30% | Cross-product retention | Direct ordering for tier-2 cities Bolt under-serves |
| Wolt (incl. Tazz) | ~17–30% | Mature consumer app + push install base | Continuity for Tazz merchants tired of re-onboarding |
| FoodPanda RO | exited | — | Re-acquire ex-FoodPanda merchants now on Glovo |
| (own delivery) | n/a | — | All-in fixed SaaS fee, predictable cost vs % of revenue |

---

## Section 2 — 12 UX/conversion improvements

### Storefront browsing

**1. Sticky bottom "View cart" bar with item count + total on mobile menu**
- *What*: Persistent cart pill anchored to viewport bottom on `(storefront)/m/[slug]`, visible while scrolling categories.
- *Where*: `apps/restaurant-web/src/components/storefront/cart-drawer.tsx` — `CartPill` is already exported but currently free-positioned; pin to `bottom-0` with safe-area inset.
- *Why*: Baymard usability research finds sticky add-to-cart bars produce 5–15% mobile conversion uplift versus non-sticky ([Baymard via easyappsecom summary](https://easyappsecom.com/guides/sticky-add-to-cart-best-practices); [Growthrock A/B](https://growthrock.co/sticky-add-to-cart-button-example/)).
- *Effort*: S
- *Lift*: ~5–10% mobile order-completion.

**2. Skeleton shimmers for menu categories on first paint, not just `loading.tsx`**
- *What*: Render text-only category headers + 3 ghost cards immediately while images stream in.
- *Where*: `apps/restaurant-web/src/components/storefront/menu-list.tsx`; complement existing `app/(storefront)/loading.tsx`.
- *Why*: NN/g — perceived performance dominates actual; skeleton screens reduce perceived wait vs spinners ([NN/g, response times](https://www.nngroup.com/articles/response-times-3-important-limits/)).
- *Effort*: S
- *Lift*: Qualitative — removes blank-flash on slow 4G common in RO suburbs.

**3. Diacritic-tolerant search highlighting in results**
- *What*: Already strips diacritics in `normalize()`; surface match by bolding the matched substring in result cards.
- *Where*: `apps/restaurant-web/src/components/storefront/menu-list.tsx` (filter logic) → pass match indices to `menu-item-card.tsx`.
- *Why*: Search-result emphasis is a Baymard top-50 e-commerce pattern; users need to see *why* something matched ([Baymard e-com benchmark](https://baymard.com/blog/current-state-of-checkout-ux)).
- *Effort*: S
- *Lift*: Removes a known friction (item-not-found bounces).

### Item detail / add-to-cart

**4. Required modifier groups: inline error + auto-scroll to first unmet group**
- *What*: When user taps "Add" with a required group unfulfilled, scroll the sheet to that group and flash a red border, instead of silently disabling the CTA.
- *Where*: `apps/restaurant-web/src/components/storefront/item-sheet.tsx` (`orderedGroups`, the disabled CTA logic).
- *Why*: Baymard — silent disabled CTAs are the #2 cause of "stuck" abandonment after price surprises ([Baymard CTA patterns](https://baymard.com/blog/checkout-form-field-descriptions)).
- *Effort*: S
- *Lift*: ~3–5% on items with required modifiers.

**5. Quantity stepper visible on the menu card after first add (don't re-open sheet to add a 2nd unit)**
- *What*: Once an item is in cart, the card's "+" pill becomes a `– N +` stepper bound to the cart line.
- *Where*: `apps/restaurant-web/src/components/storefront/menu-item-card.tsx` (the "Add" pill region).
- *Why*: Baymard grocery research: dynamically updating the add-to-cart button to a quantity selector after first add is a documented best practice ([Baymard, grocery add-to-cart](https://baymard.com/blog/grocery-add-to-cart-buttons)).
- *Effort*: M
- *Lift*: ~5% AOV (more units of the same item).

### Cart / checkout

**6. Hide Romanian apartment-block fields behind a "Bloc / scară / etaj / ap." disclosure**
- *What*: Show only `line1` + `city`; reveal `bloc/scară/etaj/apartament` only if user has an apartment (toggle "Apart la bloc").
- *Where*: `apps/restaurant-web/src/app/checkout/CheckoutClient.tsx` (the four `aptBlock/aptStair/aptFloor/aptUnit` inputs).
- *Why*: Baymard — only 20% of sites hide optional `address line 2` fields, causing unnecessary cognitive load on the majority who don't need them ([Baymard, address-line-2](https://baymard.com/blog/address-line-2)). RO houses (~45% of population) don't need any of the four.
- *Effort*: S
- *Lift*: ~3–7% completion on house deliveries.

**7. Phone field with `type="tel" inputmode="tel" autocomplete="tel"` + country prefix locked to +40**
- *What*: Audit the phone input to ensure all three attributes; show `+40` as a non-editable prefix.
- *Where*: `apps/restaurant-web/src/app/checkout/CheckoutClient.tsx` (`phone` state, `normalizeRoPhone`).
- *Why*: Mobile keyboard correctness + autofill — Baymard touch-keyboard cheat-sheet ([Baymard labs](https://baymard.com/labs/touch-keyboard-types)); `<input type="tel">` triggers numeric pad on mobile ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/tel)).
- *Effort*: S
- *Lift*: ~2% mobile completion.

**8. Free-delivery threshold progress bar in cart drawer**
- *What*: "Mai adaugă 18 lei pentru livrare gratuită" with a progress bar; already have `freeDeliveryThresholdRon` prop on `CartPill`.
- *Where*: `apps/restaurant-web/src/components/storefront/cart-drawer.tsx` — the `reachedFreeDeliveryAt` state is half-built; finish the visible progress bar.
- *Why*: 58% of shoppers add extra items just to hit free-shipping ([magebit summary of NRF data](https://magebit.com/blogs/58-of-shoppers-add-extra-items-just-for-free-shipping--heres-how-to-capture-them)); progress-bar threshold campaigns lifted AOV up to 32% in retail benchmarks ([Growth Suite review](https://www.growthsuite.net/resources/shopify-discount/progress-bar-aov-boost-strategy-guide)).
- *Effort*: S
- *Lift*: ~10–25% AOV.

**9. COD badge with "plătești doar la livrare, fără card" microcopy**
- *What*: When `codEnabled`, present COD as the trust-default option (not an afterthought to CARD); add reassurance copy.
- *Where*: `apps/restaurant-web/src/app/checkout/CheckoutClient.tsx` (`paymentMethod` radio).
- *Why*: 69% of RO customers prefer COD as their primary payment method ([Paysera RO payment methods](https://www.paysera.com/v2/en/blog/eCommerce-payment-methods-Romania)). The current default of CARD optimises for a minority.
- *Effort*: S
- *Lift*: ~5–8% completion among COD-leaning customers (esp. tier-2 cities, older demographic).

### Post-purchase / track

**10. Live ETA countdown + courier name/photo on the track page**
- *What*: Show "Ajunge în ~14 min" with live decrement, plus courier first name. Currently `TrackClient` shows status string only.
- *Where*: `apps/restaurant-web/src/app/track/[token]/TrackClient.tsx` (the order-status block).
- *Why*: 47% of consumers say real-time tracking increases trust; 80% rate accurate ETAs as very important; 94% say a positive delivery experience drives repeat orders ([Uber Eats merchants — last-mile tracking](https://merchants.ubereats.com/mx/en/resources/articles/what-is-last-mile-delivery-tracking/); [Intouch Insight via Food On Demand, 2024](https://foodondemand.com/09262024/doordash-tops-intouch-insight-report-on-delivery-performance/)).
- *Effort*: M
- *Lift*: Drives repeat-order rate, hard to A/B in-session.

**11. "Comandă din nou" CTA on the delivered-order screen, deep-linked to the same cart**
- *What*: When status = DELIVERED, show a button that pre-loads the same items back into the cart on the storefront.
- *Where*: `TrackClient.tsx` post-delivered branch + `apps/restaurant-web/src/components/storefront/reorder-rail.tsx` (already exists for storefront home; reuse the action).
- *Why*: Reorder is the dominant pattern in food delivery; DoorDash/Wolt both surface "Order again" prominently because repeat purchase frequency is the LTV driver ([Uber Eats animations / repeat order context](https://www.restaurantdive.com/news/uber-eats-boosts-delivery-tracker-transparency-with-colorful-animations/552513/)).
- *Effort*: M
- *Lift*: Qualitative — D7 retention.

### Returning customer recognition

**12. Soft-recognise returning customers via cookie and skip the form to a one-line confirmation**
- *What*: `prefill` is already plumbed through `CheckoutClient`. When all fields are pre-filled, collapse the form into a "Livrăm la: Str. X 12, ap. 3 — corect?" panel with a "Modifică" link.
- *Where*: `apps/restaurant-web/src/lib/customer-recognition.ts` + `CheckoutClient.tsx` (use `prefill` to short-circuit step `form`).
- *Why*: 19% of shoppers abandon when forced to re-enter known data; guest-style fast checkout lifts conversion 10–30% ([Baymard via Amazon Pay summary](https://pay.amazon.com/blog/for-businesses/the-baymard-report-series-how-forcing-sign-ups-drives-down-sales)).
- *Effort*: M
- *Lift*: ~10–15% on returning-cookie sessions.

---

## Ship next — top 3 (highest impact / lowest effort)

| Rank | Idea | Why now |
|---|---|---|
| 1 | **#8 Free-delivery progress bar** | Half-built (`reachedFreeDeliveryAt` exists), S effort, 10–25% AOV lift documented. |
| 2 | **#6 Hide RO apartment fields behind disclosure** | S effort, removes 4 always-visible inputs, direct Baymard-cited friction. |
| 3 | **#1 Sticky cart bar on mobile menu** | `CartPill` already exists, just position it; 5–15% mobile lift. |
