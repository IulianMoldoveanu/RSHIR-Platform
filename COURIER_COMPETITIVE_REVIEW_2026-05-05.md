# Courier Driver-App Competitive Review — Romania & EU
**Date:** 2026-05-05
**Scope:** Glovo Courier, Wolt Courier Partner, Bolt Food Courier, Tazz Riders (now Wolt RO post-2025-05 merger).
**Goal:** Ground HIR Restaurant Suite courier-app UX in real driver pain points from review sites (Trustpilot, Google Play, JustUseApp, PissedConsumer), Romanian forums (Softpedia, parerimagazin.ro), and operator guides (wiki.ro, digitalpedia.ro).

---

## 1. Glovo Courier (Romania)

### Top complaints (1–2 star themes)
1. **Auto-assign during break / "stuck online".** Couriers report the app keeps pinging assignments while they are mid-meal or mid-bathroom; rejecting hits their MRT (rating threshold) which throttles future slot bookings.
2. **Slot booking ("MRT") feels punitive.** High-rated couriers get first pick of profitable slots; new or low-rated couriers are locked out of evenings and weekends — a hidden meritocracy that drivers describe as opaque.
3. **Bundled (multi-order) orders are forced.** Algorithm bundles 2–3 orders from one or several partners; couriers can't preview the full route before accepting and end up driving a worse-paying loop than expected.
4. **Account blocks / verification delays without explanation** — months of unpaid balance with support sending canned replies (PissedConsumer 2.1/5, ~70% unfavourable).
5. **Order marked "delivered" by ghost couriers.** Riders close out without actually handing off, customer complaints land on the next rider's rating.

### Loved (4–5 star)
- Real-time bundling **does** mean more EUR per trip when the route is dense (Bucharest centre).
- In-app tip visibility immediately after delivery.
- Surge multipliers ("rain bonus", weekend x2) shown clearly on the home screen.

### UX patterns
- **Shift toggle:** *no free toggle* — couriers must book "slots" in advance based on rating tier. Going offline mid-slot damages MRT.
- **Order accept:** auto-assigned, ~15s acceptance window, decline penalises rating.
- **Navigation:** opens external Google Maps/Waze; no in-app turn-by-turn for pickup vs dropoff legs.
- **PoD:** photo or PIN only on "leave at door" deliveries; standard handoff has no proof step.

---

## 2. Wolt Courier Partner

### Top complaints
1. **Recent update tanked earnings.** Drivers on Trustpilot/JustUseApp call the late-2025 release "one of the worst updates that exist" — base fee per drop dropped, distance multiplier opaque.
2. **App crashes mid-shift**, requires multiple restarts; orders silently re-assigned to others, courier loses the job.
3. **Translation/localisation bugs** — couriers pressing buttons multiple times to read translated chef notes (multilingual cities like Helsinki/Tallinn, but pattern repeats).
4. **Restaurant marks "already picked up"** while courier is still queued; support takes >1h to resolve, meanwhile courier is offline burning time.
5. **Support funnel is one-way** — once a ticket is closed, you cannot reopen the same conversation; you must start over and lose context.

### Loved
- **Map heatmap** showing high-demand zones in real time (couriers compare it favourably vs Bolt).
- **Earnings tab** shows per-leg breakdown: base + distance + tip + bonus, plus weekly total.
- **"On the way to restaurant"** auto-detection via geofence — no manual "I'm here" tap needed.

### UX patterns
- **Shift toggle:** simple "Start delivering" / "Stop delivering" button on home, no slot lock-in.
- **Order accept:** hybrid — courier sees full pickup + dropoff address before accepting (pickup name + suburb of dropoff, ETA, distance).
- **Multi-order:** opt-in stacked orders shown as a single card with both legs.
- **PoD:** signature only for high-value or alcohol; otherwise app auto-confirms on geofence + tap.

---

## 3. Bolt Food Courier

### Top complaints
1. **App auto-disconnects to offline** after idle period — couriers miss orders because they thought they were still online (recurring Google Play complaint).
2. **Notifications fail silently** — ~1 in 3 new-order alerts have no sound; running in background = no push at all on some Android builds.
3. **Distance not shown after delivery** — drivers can't reconcile per-km pay; earnings feel arbitrary.
4. **Multi-order detours kill food quality** — Bolt encourages stacking aggressively, riders take long detours, customers complain, riders take the rating hit.
5. **No way to cancel an accepted order** — once assigned, courier is on the hook even if bike breaks down or restaurant is 1h late; partial pay is rare.

### Loved
- One-tap "I've arrived at restaurant" + photo of receipt is fast.
- Daily quest bonuses ("complete 10 orders → +30 RON") are visible from the home screen.
- Tap-to-call masked number protects courier's personal phone.

### UX patterns
- **Shift toggle:** "Go online" button, but **app silently flips offline** without alert — the #1 complaint.
- **Order accept:** auto-assign, 10s timer, decline rate visible to rider.
- **Navigation:** in-app map with pickup pin, but external app for turn-by-turn.
- **PoD:** photo of receipt at pickup; geofence + tap at dropoff.

---

## 4. Tazz Riders (now Wolt RO since 2025-05)

### Top complaints (Romanian sources)
1. **GPS route data wrong** — couriers sent to wrong addresses, customers blame courier (parerimagazin.ro, Softpedia).
2. **App instability** — "aplicația a căzut trei zile la rând" (wiki.ro, 2022 still-current pattern); migration to Wolt stack mid-2025 caused new crashes.
3. **Support queue 12-deep, 15-20 min wait**, then "no agents available" — couriers stuck mid-livrare with cold food.
4. **Photo-of-receipt at pickup is skippable** — many couriers tap "skip", leading to disputes nobody can audit.
5. **Fleet commission deductions (10–15%)** invisible inside the app — couriers see gross, pay net, can't reconcile.

### Loved
- **Earnings transparency post-redesign** — total deliveries, per-comandă fee, tips, bonuses all on one screen.
- **Surge multipliers (1.2x–2x)** announced via SMS + WhatsApp/Telegram from fleet partner — drivers know exactly when to log on.
- **Free shift scheduling** — no slot lock; you go online when you want (the single biggest reason couriers prefer Tazz over Glovo in RO).
- **Weekly payout** (Mon/Tue) is reliable and predictable.

### UX patterns
- **Shift toggle ("tură"):** free start/stop, no slot booking — Romanian couriers prize this.
- **Order accept:** algorithmic proximity-match; advice from veteran couriers is "drive toward nearest mall after each drop" because the algorithm is location-greedy.
- **Earnings:** real-time running total with per-leg breakdown.
- **PoD:** receipt photo at pickup (skippable, weak), tap at dropoff.

---

## 5. Cross-Platform Pain Synthesis

| Pain | Glovo | Wolt | Bolt | Tazz |
|---|---|---|---|---|
| Auto-flip offline without alert | — | — | **YES** | — |
| Slot/MRT lock-in | **YES** | — | — | — |
| Forced multi-order batching | **YES** | opt-in | **YES** | partial |
| Skippable PoD | — | — | — | **YES** |
| Hidden commission/distance | — | recent | **YES** | **YES** |
| Support black hole | **YES** | **YES** | **YES** | **YES** |
| GPS sends to wrong address | **YES** | — | — | **YES** |

---

## Recommendations for HIR Courier (P0/P1/P2)

Mapped to specific pain points found above. Apply the "30-second test" — every screen must be operable in 30 seconds with one hand on a moving scooter.

### P0 — Ship before scaling beyond FOISORUL A
1. **Single explicit "GO ONLINE / GO OFFLINE" toggle**, never auto-flips. If GPS or network drops, show a red banner ("Conexiune pierdută — apasă pentru reconectare") rather than silently going offline. → kills Bolt's #1 complaint.
2. **Free shift toggle, no slot booking, no MRT.** Couriers go online when they want. White-label courier (Mode A) doesn't need slot scarcity — restaurant has 1–3 riders, not a marketplace pool. → matches Tazz strength, avoids Glovo backlash.
3. **Pre-accept full route preview.** Show pickup name + dropoff suburb + total distance + total fee BEFORE the accept tap. 15-second decision window with countdown. → kills Glovo and Bolt batched-order surprise.
4. **Mandatory PoD on every drop.** Photo OR signature OR PIN — not skippable. Stored with order for audit. → fixes Tazz/Glovo "ghost delivery" disputes.
5. **Earnings ledger with per-leg breakdown, live.** Base + distance × km-rate + tip + bonus, with the formula visible (not hidden). Show distance after every delivery. → fixes Bolt and Wolt opacity complaints.

### P1 — Within 4 weeks
6. **In-app turn-by-turn for pickup leg AND dropoff leg.** Don't bounce to external Google Maps; use Mapbox or MapTiler with restaurant pin + dropoff pin pre-loaded. Cache last 5 routes for offline use. → fixes Tazz GPS-wrong-address pain.
7. **"Pe drum / Am ajuns" auto-detect via geofence**, with manual override. No more spam-tapping arrival buttons in traffic. → matches Wolt strength.
8. **Cancel-with-reason flow before "Accept lock-in".** Restaurant 30+ min late, scooter broken, accident — courier can release the order with a one-tap reason; partial pay calculated automatically. → kills Bolt's "can't cancel" complaint.

### P2 — Backlog (post first 5 tenants)
9. **Surge/bonus heatmap** (Wolt-style) on home screen. Mode A (single restaurant) probably doesn't need it; Mode C (fleet) does.
10. **In-app 2-way chat with operator (not just call)** with persistent ticket history — no closed-and-gone Wolt support pattern.

### Anti-patterns to avoid (hard NOs)
- **Don't auto-assign during marked break.** If courier taps "Pauză 15 min", route around them. Glovo's #1 complaint.
- **Don't hide distance after delivery.** Bolt does this; couriers feel cheated.
- **Don't bundle orders without preview.** Forced batching kills food quality and rider trust.
- **Don't gamify ratings into slot scarcity** for Mode A. Glovo's MRT system is poison for a 1-restaurant courier — there's no marketplace to ration.
- **Don't make PoD optional.** Tazz's skippable receipt photo is the source of half the customer disputes.

---

## Sources
- Trustpilot Glovo / Bolt Food / Wolt aggregated review pages (2024–2026)
- PissedConsumer Glovo (2.1/5, 427 reviews)
- JustUseApp Wolt Courier Partner (1336 reviews)
- wiki.ro/tazz/ce-inseamna-sa-fi-curier-la-tazz (Tazz courier first-hand 2022, still-current patterns)
- digitalpedia.ro/cat-castiga-un-curier-tazz (2025 earnings + app details)
- helpcenter-riders.tazz.ro (official Tazz rider docs)
- Google Play listings: com.bolt.deliverycourier, com.wolt.courierapp, com.glovo
- The Grocer / Restaurant Business Online — 2024-25 batched-delivery analyses
- Glovo Engineering Medium (deliveries optimization, official auto-assign description)
