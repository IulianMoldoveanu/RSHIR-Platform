# GloriaFood — sinteză finală și plan de adaptare HIR

**Autor:** Claude (Opus 4.7) pentru Iulian Moldoveanu
**Dată:** 29 aprilie 2026
**Status:** Document operațional, intern — base pentru deciziile de roadmap din mai-iunie 2026
**Branch:** `docs/gloriafood-final-synthesis` (NU se merge — doc de planificare)

**Surse sintetizate:**
- [PR #38 — firsthand screenshots](docs/research/2026-04-28-gloriafood-firsthand-screenshots.md) — 87 capturi din contul real de partener HIR
- [PR #34 — competitive analysis](docs/research/2026-04-28-gloriafood-competitive-analysis.md) — catalog public de 95+ features
- [PR #39 — master blueprint](docs/strategy/2026-04-28-hir-master-blueprint.md) — roadmap 12 săptămâni + AI CEO + reseller schema
- Live scrape Playwright al contului `restaurantlogin.com/admin/...` (28 aprilie 2026, sub `_gloriafood_scrape/`)
- Memorii strategice: `strategic_vision_courier_fleet_aggregator.md`, `gloriafood_retiring_april_2027.md`, `feedback_frugal_deploy_until_vercel_pro.md`, `pricing_two_tier_model.md`

---

## 1. Sumar executiv

GloriaFood (Oracle Hospitality) intră în retragere oficială pe **30 aprilie 2027** — banner roșu permanent confirmat pe fiecare ecran al contului de partener HIR ([PR #38 §⚠️](docs/research/2026-04-28-gloriafood-firsthand-screenshots.md)). Pentru următoarele 12 luni, asta e contextul strategic dominant pentru HIR Restaurant Suite: zeci de mii de restaurante europene (estimat 200-500 în România prin parteneri ca HIR + alți reseller-i Oracle) vor fi forțate să migreze. **Fereastra de „goana după aur" se închide ~martie 2027.**

Poziția ofensivă HIR (5 rânduri):
1. Avem deja 95% din schema GloriaFood mapată ([PR #34 §7.3](docs/research/2026-04-28-gloriafood-competitive-analysis.md#73)) — importer-ul prin Fetch Menu API v2 e tehnic clean, fără OAuth, doar key-paste.
2. Avem AI CEO (`apps/copilot`) — moat unic, GloriaFood n-are echivalent LLM și nu îl poate copia în 12 luni.
3. Avem multi-tenant centralizat — exact gap-ul lor recunoscut public ([PR #34 §4.9](docs/research/2026-04-28-gloriafood-competitive-analysis.md#49)).
4. Avem fleet aggregation (Wolt/Glovo/Foody) — out-of-scope pentru ei, lock-in pe partea operațională.
5. Suntem nativ români — T&C, ANPC, GDPR, suport, copy — vs. tonul american-casual netradus al Oracle.

**Cele 3 schimbări majore aduse Faza 1-2 după sinteză:**

1. **Reseller schema urcă din Faza 2 în Faza 1** (săptămânile 3-4). Fereastra de 12 luni e prea îngustă ca să așteptăm 6 săptămâni — partenerii HIR au nevoie de payout dashboard funcțional din ziua în care încep să migreze restaurante GloriaFood, nu peste 3 luni. Live scrape-ul confirmă că partenerii se așteaptă deja la breakdown live per restaurant (vezi §2 mai jos — `Restaurants' Sales / Autopilot Sales / Reservation deposits / Discounts (Resell Mode)` sunt 4 tab-uri separate de revenue, nu unul singur).
2. **„Adjust prices" (markup pe meniu) urcă în Faza 1 ca feature first-class transparent**, declarat în T&C. La GloriaFood e ascuns sub kebab menu „three dots" ([PR #38 §3.3](docs/research/2026-04-28-gloriafood-firsthand-screenshots.md#33)). HIR îl vinde explicit ca al doilea levier de monetizare partener, nu ca trick.
3. **„Branded mobile app" coboară de la Faza 2 P0 la Faza 3 P1.** Live scrape-ul arată că la GloriaFood e doar un toggle Yes/No fără preț vizibil ([PR #38 §2.12 Screenshot 432, 450](docs/research/2026-04-28-gloriafood-firsthand-screenshots.md#212)) — adoption e probabil scăzută. PWA + Capacitor wrapping în Faza 3 acoperă cazul cu 5% efortul unei app native.

---

## 2. Harta tab-urilor partner dashboard (NOU — din live scrape)

Cea mai importantă descoperire a live scrape-ului: textul extras din `admin_overview.txt` confirmă **navigația completă a panoului de partener** pe care capturile manuale o vedeau doar parțial. Reproducem mai jos structura exactă, plus echivalent HIR pentru fiecare tab.

### 2.1 Sidebar partner (sursa: `_gloriafood_scrape/pages/admin_overview.txt`)

```
PartnerNet
  Overview
  Performance
    Restaurants' Sales
    Autopilot Sales
    Reservation deposits
    Discounts (Resell Mode)
  Restaurants
    Management
    Orders List
    Pending Requests
  Sales & Marketing
    Preamble
    Way to go
    Partner Resources
    Restaurant Resources
  Branding
    Imprint
    Logo
    Generic domain
    Custom domain
  Leads
  Knowledge base
```

7 secțiuni mari, 14 sub-tab-uri. Asta e arhitectura informației pe care partenerii GloriaFood o cunosc din 2014 — **trebuie să fie familiară migratorilor**, dar simplificată drastic (principiul „one primary action per screen" din [Master Blueprint §8](docs/strategy/2026-04-28-hir-master-blueprint.md#8)).

### 2.2 Mapare tab → echivalent HIR

| GloriaFood tab | Path HIR propus | Schema dependentă | Efort | Faza |
|---|---|---|---|---|
| Overview | `apps/restaurant-admin/src/app/partner/page.tsx` | `partners` (există în blueprint §6) | S | F1 |
| Performance > Restaurants' Sales | `apps/restaurant-admin/src/app/partner/performance/restaurant-sales/page.tsx` | `partner_commissions.source = 'subscription'` | M | F1 |
| Performance > Autopilot Sales | `apps/restaurant-admin/src/app/partner/performance/automation/page.tsx` | `partner_commissions.source = 'automation'` | M | F2 |
| Performance > Reservation deposits | `apps/restaurant-admin/src/app/partner/performance/reservations/page.tsx` | `partner_commissions.source = 'reservation_deposit'` | M | F2 |
| Performance > Discounts (Resell Mode) | `apps/restaurant-admin/src/app/partner/performance/markup/page.tsx` | `partner_commissions.source = 'menu_markup'` (NOU) | M | F1 |
| Restaurants > Management | `apps/restaurant-admin/src/app/partner/restaurants/page.tsx` | `partner_referrals` + `tenants` join | S | F1 |
| Restaurants > Orders List | `apps/restaurant-admin/src/app/partner/restaurants/orders/page.tsx` | `orders` filtrate prin `partner_referrals.tenant_id` | M | F1 |
| Restaurants > Pending Requests | `apps/restaurant-admin/src/app/partner/restaurants/pending/page.tsx` | `partner_signup_requests` (NOU) | M | F2 |
| Sales & Marketing > Preamble | `apps/restaurant-admin/src/app/partner/marketing/page.tsx` (landing static) | n/a | S | F1 |
| Sales & Marketing > Way to go | `apps/restaurant-admin/src/app/partner/marketing/playbook/page.tsx` | `partner_milestones` (NOU, opt) | S | F2 |
| Sales & Marketing > Partner Resources | `apps/restaurant-admin/src/app/partner/marketing/resources/page.tsx` (CDN download) | `partner_resources` (NOU, opt) | S | F1 |
| Sales & Marketing > Restaurant Resources | `apps/restaurant-admin/src/app/partner/marketing/restaurant-kit/page.tsx` | `restaurant_resources` (NOU, opt) | S | F2 |
| Branding > Imprint | `apps/restaurant-admin/src/app/partner/branding/imprint/page.tsx` | `partners.imprint_*` cols | S | F1 |
| Branding > Logo | `apps/restaurant-admin/src/app/partner/branding/logo/page.tsx` | `partners.logo_url` + Supabase Storage | S | F1 |
| Branding > Generic domain | `apps/restaurant-admin/src/app/partner/branding/domain/generic/page.tsx` | `partners.subdomain` (e.g. `tenant.partner.hir.ro`) | M | F2 |
| Branding > Custom domain | `apps/restaurant-admin/src/app/partner/branding/domain/custom/page.tsx` | `partners.custom_domain` + Vercel domain API | L | F2 |
| Leads | `apps/restaurant-admin/src/app/partner/leads/page.tsx` | `partner_lead_intents` (NOU) | M | F3 |
| Knowledge base | `apps/restaurant-admin/src/app/partner/knowledge/page.tsx` | static MDX, opt index Algolia | M | F2 |

**Concluzie:** 14 din 18 tab-uri sunt fezabile în Faza 1-2. Doar `Custom domain` (Vercel API + DNS), `Knowledge base` (content lift) și `Leads` (geo-routing) trec în Faza 3.

### 2.3 Iconografia paid services (bonus din scrape)

În `screenshots/admin_restaurants.png` (capturat live), coloana **PAID SERVICES** afișează **6 iconițe gri rotunde** (toate inactive pe contul demo):

1. Globe (Custom Domain $25/mo)
2. Wallet/Card (Online Payments $29/mo)
3. Discount tag (Advanced Promo $19/mo)
4. Mobile phone (Branded Mobile App $59/mo)
5. Refresh / loop (Sales-Optimized Website $9/mo sau Autopilot)
6. Receipt (POS $49/mo/loc — sau Reservation Deposits)

[needs validation] Maparea exactă iconiță→produs — capturile sunt în grayscale fără tooltip. Dar logica e clară: **HIR trebuie să arate exact aceleași 6 stări per restaurant referit de partener**, ca check-list de upsell. Modelul mental pentru partenerul GloriaFood este „6 produse plătite per restaurant" — copiem asta direct.

---

## 3. Adaptation Matrix — copy / refuse / innovate

Clasificare:
- **COPY** — implementăm echivalent HIR identic sau mai bun
- **REFUSE** — failure mode UX cunoscut, marketăm împotriva
- **INNOVATE** — angle ofensiv HIR (AI CEO, RO-localized, fleet, etc.)

### 3.1 Onboarding & Setup

| # | Feature | Clasif. | Acțiune HIR concretă |
|---|---|---|---|
| 1 | Setup wizard liniar 7 secțiuni × 3-5 sub-pași (~25 ecrane „Next") | REFUSE | Wizard 5 ecrane max în `/dashboard/onboarding`, autosave per ecran, importer GloriaFood ca shortcut. Talking point: „10 min vs 2-4h". |
| 2 | Restaurant basics (nume, telefon, country, timezone, address) | COPY | `/dashboard/onboarding/basics` — formular single-page cu Google Places autofill. |
| 3 | Cuisine selector (taxonomy) | COPY | Folosim `restaurant-templates` PR #28: italian/asian/fine/bistro/romanian. Template = preset cuisine + visual. |
| 4 | Account confirmation (email verify) | COPY | Supabase Auth standard. |
| 5 | Microcopy conversațional („What is your restaurant's address?") | COPY | Aplicăm pattern-ul în RO: „Care e adresa restaurantului tău?". |
| 6 | Toggle Yes/No mare la întrebări binare | COPY | Pattern UX matur, single-tap. Folosim shadcn `Switch` cu label-uri RO. |

### 3.2 Menu management

| # | Feature | Clasif. | Acțiune HIR concretă |
|---|---|---|---|
| 7 | Editor meniu cu 3 niveluri pop-over + Save în 3 locuri diferite | REFUSE | Single-page drag-drop cu autosave. Marketing: „Editor flat, fără pop-over imbricate". |
| 8 | Categories → Items → Sizes → Choices/Addons (4 niveluri) | COPY | Schema mapată în [PR #34 §7.3](docs/research/2026-04-28-gloriafood-competitive-analysis.md#73). Adăugăm `menu_item_sizes` table. |
| 9 | Choices/Addons cu `force_min`/`force_max` | COPY | Coloane `min_select`/`max_select` în `menu_modifier_groups`. Validare hard pe storefront. |
| 10 | Allergen tags (HOT, VEGETARIAN, VEGAN, GLUTEN_FREE, HALAL, NUT_FREE, DAIRY_FREE, RAW) | COPY | Enum literal copiat — migratorii își păstrează tag-urile lossless. |
| 11 | Nutritional values per item/size | COPY (P2) | `menu_items.nutritional_values jsonb` — direct mapping. |
| 12 | Kitchen-internal-name | COPY | `menu_items.kitchen_name`. Apare pe KDS print route. |
| 13 | Per-order-type item availability | COPY | `menu_items.allowed_order_types text[]` (Delivery/Pickup/Dine-in). |
| 14 | Mark sold-out (until tomorrow / specific date / indefinite) | COPY | UX detail: dropdown cu 3 opțiuni. Stat machine: `sold_out_until timestamptz NULL`. |
| 15 | Free stock photo library | INNOVATE | În loc de bibliotecă statică, AI CEO sugerează fotografii prin Unsplash API + Vision auto-tag. „Adaugă-ți pizza" → 5 imagini relevante. |
| 16 | Adjust prices (markup % per catalog cu rounding .99) | INNOVATE | Feature first-class transparent: `partners.markup_pct` cu split automat la fiecare comandă în `partner_commissions.source = 'menu_markup'`. Declarat în T&C. Restaurant **vede** prețul real, partenerul **vede** markup-ul, clientul **vede** prețul final. |
| 17 | Multi-language menu (paid tier la GloriaFood) | INNOVATE | Inclus în Plus 49€/lună. RO + EN out-of-the-box, traducere AI CEO assist. |
| 18 | Scheduled menu (daypart switching) | COPY (P1, F3) | `menu_categories.active_hours jsonb`. |

### 3.3 Order management

| # | Feature | Clasif. | Acțiune HIR concretă |
|---|---|---|---|
| 19 | Real-time order notification operator | COPY | Există deja `notify-new-order` edge fn. |
| 20 | Buckets: All / In Progress / Ready cu swipe-right | COPY | `/dashboard/orders` route — adaugăm swipe gestures pe mobile (Hammer.js sau native PointerEvents). |
| 21 | **Forced-volume alarm fără mute** | REFUSE — F0 marketing | Cea mai vocală nemulțumire ([PR #34 §4.12](docs/research/2026-04-28-gloriafood-competitive-analysis.md#412)). Talking point repetat în deck: „Telefonul tău, regulile tale". Volume slider 0-100% în settings, no force-loud. |
| 22 | Auto-print Star/Epson | COPY (F2) | Necesită driver — folosim ESC/POS via WebUSB sau Cloud Print Bridge. Partner cu producători. |
| 23 | Out-of-stock din operator app | COPY | Există parțial; finalizăm pe `/dashboard/orders` cu „Mark sold-out". |
| 24 | Pause services cu mesaj custom client-facing | COPY | `tenant_settings.paused_until` + `tenant_settings.pause_message`. |
| 25 | Test-order generator | COPY | Buton „Send test order" — generează comandă demo, nu apare în reports. |
| 26 | Connectivity status indicator | COPY (P2) | Existent partial via Vercel Speed Insights — afișăm semafor verde/roșu pe sidebar. |
| 27 | Scheduled / pre-orders | COPY | Există parțial; adăugăm fereastră de timp configurabilă per service. |

### 3.4 Promotions & Marketing automation

| # | Feature | Clasif. | Acțiune HIR concretă |
|---|---|---|---|
| 28 | Promo code (% / fix amount / free item / free delivery) | COPY | Există majoritatea. |
| 29 | **Free-delivery promo doar % (fără fixed)** | INNOVATE — F1 marketing | GloriaFood n-are fixed-amount delivery promo ([PR #34 §4.3](docs/research/2026-04-28-gloriafood-competitive-analysis.md#43)). HIR shipează fixed-amount în S effort. Talking point. |
| 30 | First-time-buyer discount preset | COPY | Promo template în UI. |
| 31 | Cart abandonment recovery email/SMS | COPY (Autopilot) | Edge fn nou: `lifecycle-cart-abandon`, draft de AI CEO + approve. |
| 32 | Win-back / re-engage inactive | COPY (Autopilot) | Edge fn nou: `lifecycle-winback`. Trigger: 21+ zile fără comandă. |
| 33 | Encourage second order | COPY (Autopilot) | Edge fn nou: `lifecycle-second-order`. 60% never order again — copy stat-bait. |
| 34 | Birthday automation | COPY (P1, F3) | `customer.birthday` field opt; trimite cupon ziua de naștere. |
| 35 | Referral / „invite a friend" | COPY (P2) | Cupon partajabil cu cod custom. |
| 36 | Online punch card („5 orders → free dessert") | COPY (F3) | `loyalty_punches` table; logică simplă. |
| 37 | Lista de promoții fără filtre/sortare, status doar toggle eye | REFUSE | Filter bar + sort + search în `/dashboard/promos`. Status badge color-coded. |
| 38 | Pre-built campaigns ca template-uri (RO copy) | COPY | Bibliotecă în `apps/restaurant-admin/src/lib/campaign-templates.ts`. Engleză → română nativă. |
| 39 | Flyer generator (PDF printabil) | COPY (F3) | Canva-template-with-substitution; 1-day build per template. |
| 40 | Customer invitations bulk email | COPY | Newsletter feature deja in flight (`feat/newsletter-resend`). |
| 41 | Website rank checker / Google listing analysis | COPY (P2) | API call către Google PageSpeed + GMB stats. |

### 3.5 Customer experience

| # | Feature | Clasif. | Acțiune HIR concretă |
|---|---|---|---|
| 42 | Reservations widget (free) + deposits ($0.50/guest) | COPY (F1 P0) | `reservations` table + `reservation_deposits`. Stripe Connect pentru deposit. |
| 43 | QR-code dine-in cu table-tagging | COPY (F1 P0) | `/m/[slug]/t/[table_id]` route + `orders.table_id`. |
| 44 | QR codes cu sub-tipuri (Dine in / Room service / Sunbeds / Suite delivery) | INNOVATE — F3 vertical | Atac vertical hotel/stadioane/plaje. `qr_code_kinds enum`. Vertical-specific copy. |
| 45 | Order status tracking page | COPY | Există deja `/track/[token]`. |
| 46 | Saved customer info (recognition cookie) | COPY | Există. |
| 47 | Customer login | COPY | Există `/account`. |
| 48 | Multi-language storefront widget | INNOVATE | RO+EN free. Plus 49€ adaugă HU/DE/FR cu AI CEO traduceri auto. |

### 3.6 Storefront & branding

| # | Feature | Clasif. | Acțiune HIR concretă |
|---|---|---|---|
| 49 | Embeddable widget pentru orice site | COPY (F2) | `<script src="https://cdn.hir.ro/widget.js" data-tenant="..."></script>` — drop-in JS embed. |
| 50 | Standalone restaurant website templated | COPY | Există `restaurant-web` cu 5 verticale. |
| 51 | **„All restaurants menus look the same"** ([PR #34 §4.6](docs/research/2026-04-28-gloriafood-competitive-analysis.md#46)) | REFUSE — F0 marketing | Talking point: „GloriaFood = un widget. HIR = brand-ul tău, fonturile tale, hero-ul tău". Templates PR #28 = 5 looks distincte. |
| 52 | Custom domain + DNS owned by Oracle ($25/mo) | INNOVATE | Custom domain free pe Plus 49€, **DNS-ul îl deține restaurantul** (Vercel domain), exit clean oricând. |
| 53 | Co-branding partial (Oracle rămâne în URL + footer) | INNOVATE — REFUSE | White-label real: domeniul partenerului, footer-ul partenerului, FĂRĂ mențiune HIR în comunicarea către client final. |
| 54 | Imprint partener (contact peste toate restaurantele) | COPY | `partners.imprint_*` cols. Aplicat la confirmation emails + receipt footer. |
| 55 | Logo partener pe Self-service admin + Restaurant emails + Order taking app | COPY | Multi-surface logo binding via `partner_id` join. |
| 56 | Sales-Optimized Website paid ($9/mo) vs Legacy embed | INNOVATE | Inclus default în Free. Free tier cu HIR footer, Plus 49€ scoate footer-ul. |

### 3.7 Multi-location & chain management

| # | Feature | Clasif. | Acțiune HIR concretă |
|---|---|---|---|
| 57 | Multi-location centralized dashboard (GloriaFood gap recunoscut) | INNOVATE | Pachet C = chain dashboard cu central settings + per-location overrides. Demo line: „3 locații? Un tab. Klar". |
| 58 | Per-location separate login | REFUSE | HIR: un singur owner, multiple `tenant_locations`. Couriers invitați per location. |
| 59 | Per-location menu cu central push | COPY (F2) | „Push menu changes to all 5 locations" — bulk operation. |
| 60 | Headquarter website (lists all locations) | COPY (F2) | Component pre-existent în `restaurant-web`; activat când `tenant_locations.count > 1`. |

### 3.8 Operations & delivery

| # | Feature | Clasif. | Acțiune HIR concretă |
|---|---|---|---|
| 61 | Delivery zone polygon | COPY | Există `/dashboard/zones`. |
| 62 | Per-zone delivery fee + min order | COPY | Există. |
| 63 | **Driving-distance delivery fee (#1 GloriaFood complaint)** | INNOVATE — F1 P0 | `delivery-client` deja vorbește cu OSM. Coloana `delivery_zones.fee_mode = 'distance'\|'flat'`. Talking point în deck. |
| 64 | **Day-of-week zone rules (#2 complaint)** | INNOVATE — F3 | `delivery_zones.active_dow int[]` + `active_hours jsonb`. |
| 65 | Vacation mode + holiday hours | COPY | `tenant_settings.vacation_until` + holiday calendar. |
| 66 | **NATIVE delivery dispatch (out of scope GloriaFood)** | INNOVATE — moat | Multi-fleet (Wolt/Glovo/Foody/Bolt) via `integration-dispatcher`. Asta e diferențiatorul real. |
| 67 | Heatmap of out-of-zone order attempts | COPY (F1 P0) | Datele există deja în `order_attempts.address`. UI nou: heatmap.js. |
| 68 | Connectivity Health monitoring (target >95%) | COPY | `tenant_uptime_logs` + dashboard chart. Alerts SMS/email <95%. |

### 3.9 Reports & analytics

| # | Feature | Clasif. | Acțiune HIR concretă |
|---|---|---|---|
| 69 | Sales summary cu Tax/Gross/Tips/Other split | COPY | Există parțial; adăugăm coloane fiscale precise. |
| 70 | Website funnel 5 pași cu procente | COPY | Pattern visual standard. |
| 71 | Customer chart New vs Returning | COPY | Există parțial. |
| 72 | Google ranking gated pe Custom Domain | REFUSE | HIR Google ranking funcționează pe domeniul HIR sau custom — fără gate artificial. |
| 73 | Website visits segmented pe canal | COPY | UTM parsing + Vercel Analytics. |
| 74 | Promotions Stats chart | COPY | Există parțial. |
| 75 | List View Orders + Clients cu filter | COPY | Există. |
| 76 | **AI CEO Copilot — operator-facing LLM advisor** | INNOVATE — moat | Differentiatorul principal. „GloriaFood îți dă rapoarte. HIR îți dă un CFO". |
| 77 | Daily digest email | COPY | Există `daily-digest` edge fn. |

### 3.10 Integrations

| # | Feature | Clasif. | Acțiune HIR concretă |
|---|---|---|---|
| 78 | Public Fetch Menu API | COPY | Există `integration-core`. Documentăm public la `docs.hir.ro`. |
| 79 | Push & Poll Accept Orders API | COPY | Există `integration-dispatcher`. |
| 80 | POS partner integrations (SambaPOS, Simphony) | COPY (F3) | Adapter pattern. |
| 81 | Stripe payment processor | COPY | Există parțial. |
| 82 | Third-party delivery (Glovo / Wolt / Bolt / Tazz) | INNOVATE — moat | GloriaFood out-of-scope. HIR core competence. |

### 3.11 Reseller / Partner program

| # | Feature | Clasif. | Acțiune HIR concretă |
|---|---|---|---|
| 83 | Comision lifetime 20% pe abonamente | COPY | `partners.commission_pct = 20` default. |
| 84 | Threshold 5 clienți activi pentru payout | INNOVATE | HIR: NO threshold — payout săptămânal de la prima comandă. Talking point recrutare reseller. |
| 85 | Reconciliere comision prin export CSV manual | REFUSE | Stripe Connect → payout săptămânal, breakdown live, no manual export. |
| 86 | Adjust prices ascuns sub kebab menu | INNOVATE | Markup engine first-class la `/partner/branding/pricing`. Split per comandă. |
| 87 | 3 modele (Re-sell / Direct sale / White-label) | COPY | Tier Bronze/Silver/Gold în [Master Blueprint §6](docs/strategy/2026-04-28-hir-master-blueprint.md#6). |
| 88 | Lead routing geo (restaurante nearby pe hartă) | COPY (F3) | Map view în `/partner/leads` cu pin-uri. |
| 89 | Partner Resources / Restaurant Resources biblioteci PDF | COPY | CDN + listă filtrabilă. RO copy. |
| 90 | Branding > Imprint + Logo + Custom Domain | COPY | Mapat in §2.2 deja. |

### 3.12 Other

| # | Feature | Clasif. | Acțiune HIR concretă |
|---|---|---|---|
| 91 | Order Taking App pe tabletă (iPad/Android) | COPY (F2) | PWA `/dashboard/orders?mode=taking`. |
| 92 | Alert call backup pe număr telefon | COPY (P2) | Twilio fallback dacă tableta e offline >5 min. |
| 93 | „Call me back and I'll tell you my card details" | REFUSE | GDPR/PCI risky. Nu shipăm. |
| 94 | Reservation deposit cu Stripe Connect | COPY | Mapat în §3.5. |
| 95 | Smart links generator | COPY | Generator link-uri pentru Google/Insta/TikTok/Yelp. |
| 96 | Facebook Shop Now button wizard | COPY (P2) | Embed link generator. |
| 97 | Connectivity Health „Last successful check 30 Days 5 Hours..." text | REFUSE | Relative time + culoare semafor. „Verde acum / roșu de 2 zile". |
| 98 | Banner roșu „retiring April 30, 2027" pe fiecare ecran | REFUSE — F0 marketing | Cel mai mare gift de PR vreodată. Capturăm screenshot, îl punem în deck. |

**Total: 98 rânduri în matrice.** 31 COPY direct, 14 REFUSE (talking points), 14 INNOVATE (moats / fleet-specific). Restul: COPY cu twist (P1/P2/P3 sau RO localization).

---

## 4. Faza 1 + 2 — listă re-prioritizată

### 4.1 Ce graduează din Faza 2 în Faza 1

| Feature | Motiv |
|---|---|
| **Reseller schema + partner dashboard MVP** | Fereastra 12 luni + live scrape arată că partenerii GloriaFood se așteaptă deja la 4 tab-uri Performance separate. Fără asta, recrutarea reseller-ilor în mai-iunie 2026 e blocată. |
| **Adjust prices (markup engine)** | Al doilea levier de monetizare partener. La GloriaFood e ascuns, HIR îl declară ca feature legal explicit din ziua 1. |
| **Allergen tags + per-size pricing + modifier min/max** | Era F2 în [PR #34 §6](docs/research/2026-04-28-gloriafood-competitive-analysis.md#6) → urcă în F1 pentru a debloca importer lossless. Fără sizes/modifiers/allergens, importul e cu pierderi → nu putem promite „5 minute lossless". |
| **Cart abandonment recovery** | Era F2. Migratorii GloriaFood folosesc deja Autopilot ($19/mo); fără asta în F1, ei pierd din capability la mutare. |
| **Heatmap of out-of-zone orders** | Era F1 deja, dar accelerat în săptămâna 4 (vs 6) — datele există deja, e doar UI. |

### 4.2 Ce poate să cadă (replicarea GloriaFood-specifică nu e necesară)

| Feature | Motiv drop |
|---|---|
| Branded mobile app native (iOS+Android) | PWA + Capacitor wrapping în F3 acoperă cazul. Live scrape arată că la GloriaFood feature-ul există dar nu e adoptat masiv (toggle Yes/No fără upsell prompt vizibil). |
| Auto-print receipt printer drivers | Partner cu Star/Epson SDK în F3. Nu shipăm noi drivere. |
| Forced-volume order alarm | DON'T BUILD. Marketăm AGAINST. |
| „Call me back card details" | GDPR/PCI risky. Skip permanent. |
| Hotel ordering mode | F4 sau niciodată. Nu vrem vertical 6+ înainte de F3 closure. |
| Online punch card | F3, nu F2. Lifecycle automation acoperă 80% din retention. |
| WordPress / Wix / Squarespace plugins | F3+. Embed widget JS standalone acoperă 90%. |

### 4.3 Importer „Migrate from GloriaFood" — split în faze

P0 #1 confirmat. Split:

| Phase | Scope | Effort | Săptămâna |
|---|---|---|---|
| F1.1 — Skeleton | Fetch Menu API client + schema mapping + import preview UI fără branding | M (2 sprinturi) | S2-S3 |
| F1.2 — Polish | Side-by-side review, edit-before-confirm, CSV fallback pentru customers/promos, error handling | M | S4-S5 |
| F1.3 — Marketing landing | `hiraisolutions.ro/migrate-from-gloriafood` cu hero + 5 reasons + flow viz + CTA | S | S5 |
| F2.1 — Order push dual-route | `integration-dispatcher` primește GloriaFood Push, mirror în HIR | M | S7 |
| F2.2 — SEO + Google Ads | Landing optimizat pentru „GloriaFood alternativă" + ads | S | S6-ongoing |

### 4.4 Reseller schema în Faza 1 — confirmare

**DA, urcă în F1.** Justificare:

1. **Live scrape arată complexitatea reală a partner UX-ului GloriaFood** (4 sub-tab-uri Performance, 2 sub-tab-uri Branding, 4 sub-tab-uri Sales & Marketing). Reseller-ii noi recrutați în mai-iunie 2026 vor compara HIR cu PartnerNet — dacă HIR are doar tabel basic de comisioane, pierdem credibilitate.
2. **Banner-ul roșu GloriaFood = pitch oferit pe tavă** pentru reseller-i. Dar pitch-ul cere tooling: invite link, breakdown live, payout schedule. Fără ele, reseller-ii nu pot face vânzări.
3. **Fereastra de 12 luni înseamnă că recrutarea reseller-ilor e accelerată.** Dacă așteptăm până în luna 3 (F2), pierdem 25% din window.
4. **Schema e relativ simplă** ([Master Blueprint §6](docs/strategy/2026-04-28-hir-master-blueprint.md#6)) — 3 tabele, RLS clar, UI simplificat poate fi shipped în 2 săptămâni.

Plan concret:
- S3: schema migration (`partners`, `partner_referrals`, `partner_commissions`)
- S4: partner dashboard MVP (8 tab-uri, vezi §5)
- S5: invite link + signup flow with `?ref=<code>`
- S6-S12: F2 polish + onboarding kit

---

## 5. Partner Dashboard MVP — listă features

Path-uri toate în `apps/restaurant-admin/src/app/partner/`. Tab-uri ordonate după volumul de uz așteptat.

| # | Feature | Path | Schema dep. | Efort | Faza |
|---|---|---|---|---|---|
| 1 | Overview cu 6 KPI cards (MRR, comision MTD, restaurante active, restaurante pending, leads, NPS partener) | `page.tsx` | `partner_commissions` agg + `partner_referrals` count | M | F1 |
| 2 | Restaurants list cu coloane Restaurant / Model (Re-sell/White-label) / Paid Services (6 iconițe) / Creation Date / Actions | `restaurants/page.tsx` | `partner_referrals` join `tenants` | M | F1 |
| 3 | Add Restaurant — flow „Invite link" + „Direct signup" (CSV bulk pentru migratori GloriaFood) | `restaurants/add/page.tsx` | `invite_codes` + `partner_signup_requests` | M | F1 |
| 4 | Performance — Restaurants' Sales tab cu tabel per restaurant: Generated Orders / Generated Sales / List Price / YOUR FEE | `performance/sales/page.tsx` | `partner_commissions` agg | M | F1 |
| 5 | Performance — Markup (Discounts in Resell Mode) tab cu split per restaurant | `performance/markup/page.tsx` | `partner_commissions.source = 'menu_markup'` | M | F1 |
| 6 | Branding — Imprint (nume, email, telefon, footer text) | `branding/imprint/page.tsx` | `partners.imprint_*` cols | S | F1 |
| 7 | Branding — Logo upload (PNG transparent max 1304x100) cu preview | `branding/logo/page.tsx` | `partners.logo_url` + Storage | S | F1 |
| 8 | Branding — Markup engine (% markup catalog + rounding rules) cu preview live | `branding/pricing/page.tsx` | `partners.markup_pct` + `partners.markup_rounding` | M | F1 |
| 9 | Settings — IBAN + payout frequency (săptămânal default) + threshold | `settings/payout/page.tsx` | `partners.iban` + `partners.payout_*` | S | F1 |
| 10 | Invite link generator (`?ref=<code>` cu QR code download) | `settings/invite/page.tsx` | `partners.invite_code` | S | F1 |
| 11 | Performance — Autopilot Sales tab (când shipăm Autopilot în F2) | `performance/automation/page.tsx` | `partner_commissions.source = 'automation'` | M | F2 |
| 12 | Performance — Reservation Deposits tab | `performance/reservations/page.tsx` | `partner_commissions.source = 'reservation_deposit'` | M | F2 |
| 13 | Restaurants — Orders List (toate comenzile prin restaurantele referite, cu filter) | `restaurants/orders/page.tsx` | `orders` + `partner_referrals` join | M | F2 |
| 14 | Restaurants — Pending Requests (signup-uri în review) | `restaurants/pending/page.tsx` | `partner_signup_requests` | M | F2 |
| 15 | Sales & Marketing — Resources (download kit: leaflet RO, e-book RO, video tutorial RO) | `marketing/resources/page.tsx` | CDN + `partner_resources` opt | S | F1 (kit minim) → F2 (full) |
| 16 | Sales & Marketing — Way to go playbook (5 pași onboarding partener nou) | `marketing/playbook/page.tsx` | static MDX | S | F2 |
| 17 | Branding — Generic domain (subdomain `partener.hir.ro`) | `branding/domain/generic/page.tsx` | `partners.subdomain` | M | F2 |
| 18 | Branding — Custom domain (Vercel domain API + DNS auto-config) | `branding/domain/custom/page.tsx` | `partners.custom_domain` + Vercel API | L | F2 |
| 19 | Knowledge base (search + categorii: POS / Partner Dashboard / Restaurant Setup / Video Tutorials) | `knowledge/page.tsx` | static MDX + opt Algolia | M | F2 |
| 20 | Leads — geo map cu restaurante nearby + request-to-help flow | `leads/page.tsx` | `partner_lead_intents` + Mapbox | L | F3 |

**Total: 20 features.** F1 livrabilă: features 1-10 + 15 (~3 săptămâni 1 dev). F2: 11-19 (~5 săptămâni). F3: 20.

Schema migration prefix: `2026_05_partner_program.sql` cu cele 3 tabele din [Master Blueprint §6](docs/strategy/2026-04-28-hir-master-blueprint.md#6) + `partners.imprint_*` cols + `partners.markup_*` cols + `partner_signup_requests` + `partner_resources` + `partner_lead_intents`.

---

## 6. Landing page „Mută-te de la GloriaFood" (RO)

Path final: `apps/restaurant-web/src/app/migrate-from-gloriafood/page.tsx` (sau static în `hir-corporate-site` dacă livrăm înainte de Vercel Pro).

### 6.1 Hero

> # Mută-te de la GloriaFood în 5 minute.
> ## Fără să scrii o linie. Fără să pierzi un client. Fără să plătești o lună în plus.
>
> GloriaFood se închide pe 30 aprilie 2027. **Mai ai 12 luni.** Restaurantul tău, meniul tău, clienții tăi — toate intră în HIR în 5 minute, cu un singur key.
>
> [**Începe migrarea →**](/onboarding?from=gloriafood)
> _Nu ai cont GloriaFood? [Vezi de ce te-ar interesa HIR oricum.](/de-ce-hir)_

### 6.2 Cele 5 motive (5 reasons)

> ## De ce HIR e următoarea ta platformă, nu doar înlocuitorul
>
> ### 1. Banner-ul roșu nu mai apare niciodată.
> GloriaFood ți-a pus pe fiecare ecran un banner care îți zice că platforma moare. La HIR nu există așa ceva. Construim pentru următorii 10 ani, nu pentru următoarele 12 luni.
>
> ### 2. Setup în 10 minute, nu 4 ore.
> Wizard-ul GloriaFood are 7 secțiuni × 5 sub-pași = 25 ecrane „Next" pentru un restaurant nou. La HIR sunt 5 ecrane. Și dacă ai cont GloriaFood, importăm automat: meniu, categorii, modificatori, alergeni, prețuri, ore de program. Pas cu pas, dar fără pași inutili.
>
> ### 3. AI CEO — primul restaurant suite cu un creier.
> În fiecare dimineață primești 3 sugestii pe Telegram: „Pizza Margherita scade 30% azi, vrei să trimit promo 15% la 50 clienți?". Aprobi cu 👍, restul face Asistentul HIR — emails, sold-out, postări Instagram, win-back, totul. La GloriaFood ai 100 butoane. La noi, ai un asistent.
>
> ### 4. Brandul tău, fără mențiunea HIR în comunicarea cu clienții.
> GloriaFood permite logo în top-bar admin, dar URL-ul rămâne `restaurantlogin.com` și footer-ul email-urilor zice „Supported by PartnerNet". HIR scoate complet mențiunea HIR pe planul Plus (49€/lună): domeniul tău, footer-ul tău, app-ul tău. Fără reziduuri.
>
> ### 5. Livrare nativă, fără să suni curierul.
> GloriaFood îți dă comanda. Și de acolo… te descurci. HIR te conectează automat la flotele Wolt, Glovo, Foody și Bolt — alegi automat sau preferințial, partenerul nostru livrează, tu vezi statusul live, clientul vede track link cu poza la livrare. Asta e diferența între un widget de comenzi și un restaurant suite real.

### 6.3 Cum se face migrarea

> ## Cum funcționează „5 minute"
>
> 1. **Te înregistrezi pe HIR** cu emailul + numele restaurantului. (30 secunde)
> 2. **Alegi „Vin de la GloriaFood"** la onboarding. (10 secunde)
> 3. **Iei key-ul Fetch Menu** din contul tău GloriaFood — Restaurant Admin → Others → 3rd party integrations → Enabled integrations → template „Fetch Menu". (60 secunde, tutorial video în pagină)
> 4. **Lipești key-ul în HIR.** Importăm meniul integral: categorii, produse, mărimi, alegeri, alergeni, valori nutriționale, nume interne pentru bucătărie. (30 secunde — chiar e atât de rapid)
> 5. **Aprobi previzualizarea** side-by-side. Editezi orice nu îți place. Confirmi. (2-3 minute, depinzând de cât de complicat e meniul)
>
> În acest moment ai un storefront live, branded HIR, cu meniul tău. Adresa, programul, zonele de livrare le importăm pe ele când îți generezi key-ul „Push Accepted Orders" (alți 60 secunde). Dacă vrei, păstrezi widgetul GloriaFood activ încă o săptămână — primim comenzile lor în paralel ca să vezi că totul curge corect, apoi treci pe HIR fără să pierzi un singur client.

### 6.4 Comparație 1-page

| Cu GloriaFood | Cu HIR |
|---|---|
| Banner roșu „retiring April 30, 2027" pe fiecare ecran | Niciodată |
| Setup wizard 25 ecrane | 5 ecrane + import GloriaFood |
| Custom Domain $25/lună (Oracle deține DNS-ul) | Inclus pe Plus 49€, tu deții DNS-ul |
| Comision partener prin export CSV manual | Stripe Connect săptămânal, breakdown live |
| Fără AI advisor | AI CEO Telegram + dashboard |
| Fără dispatch curier | Wolt + Glovo + Foody + Bolt nativ |
| Branded mobile app $59/lună | Inclus pe Pro 149€ |
| Lifecycle automation $19/lună | Inclus pe Plus 49€ |
| Alarmă forțată loud, fără mute | Volume slider, regulile tale |
| Tonul interfeței: american-casual netradus | Nativ român |

### 6.5 CTA final + bonus migrator

> ## Bonusul tău de migrator
>
> Dacă închizi contul GloriaFood înainte de 30 septembrie 2026 și migrezi pe HIR, primești:
>
> - **3 luni 50% reducere** pe Plus sau Pro
> - **Setup gratuit** asistat de echipa HIR (Iulian răspunde personal)
> - **Importer prioritar** — meniul tău intră în primele 24h
> - **Migration call** de 30 min pe Google Meet ca să trecem împreună prin tot
>
> [**Începe migrarea acum →**](/onboarding?from=gloriafood&promo=MIGRATOR50)
>
> _Sau scrie-ne pe WhatsApp la +40 769 663 169 — răspundem în maxim 2 ore între 9-21._

---

## 7. Pitch deck reseller (RO, slide-by-slide)

Format: 10 slide-uri pentru recrutare 1-on-1 sau call de grup. Tonul direct, fără jargoane corporate.

### Slide 1 — Oportunitatea

**Titlu:** GloriaFood se închide. Cineva trebuie să mute restaurantele. Acela ești tu.

**Body:**
- 30 aprilie 2027 — GloriaFood (Oracle) se retrage oficial
- România: estimat 200-500 restaurante pe GloriaFood, prin parteneri ca HIR
- Toate vor migra în următoarele 12 luni
- HIR e singura platformă românească pregătită cu importer 5-min, AI CEO și flote integrate
- **Ești la momentul potrivit. Să nu îl ratezi.**

### Slide 2 — De ce HIR câștigă

**Titlu:** 3 moats pe care nimeni nu le poate copia în 12 luni

**Body:**
1. **AI CEO** — primul restaurant suite european cu LLM operațional (sugestii Telegram, auto-execute, ROI măsurabil în 30 zile)
2. **Simplitate sălbatică** — onboarding 10 min, max 5 ecrane, autosave, fără pop-overs imbricate, copy nativ român
3. **Flote integrate** — Wolt + Glovo + Foody + Bolt prin relațiile personale Iulian, fără comision Glovo de 25-30%

### Slide 3 — Programul reseller (mecanic)

**Titlu:** Cum câștigi tu

**Body (mecanică Bronze default):**
- **20% comision lifetime** pe abonamentele Plus/Pro ale restaurantelor pe care le aduci
- **Plus markup propriu pe meniu** (% configurat de tine, vizibil în tabel partener) — al doilea levier de monetizare
- **Plată săptămânală** prin Stripe Connect (NU lunar, NU CSV manual ca la GloriaFood)
- **Fără threshold** — primești bani de la prima comandă a primului tău restaurant
- **Fără exclusivitate** — poți vinde și GloriaFood/Glovo în paralel, până migrezi gradual

### Slide 4 — Tier-urile

**Titlu:** Bronze → Silver → Gold

| Tier | Comision | Markup permis | Prag |
|---|---|---|---|
| **Bronze** | 20% | 0% | Default — orice partener nou |
| **Silver** | 15% | până la 30% peste preț bază | 5+ restaurante active |
| **Gold** | 10% | până la 50% peste preț bază | 20+ restaurante + meeting IRL cu HIR |

> Bronze e direct sales pură. Silver/Gold sunt pentru cei care vor să-și facă brand local peste HIR (gen „[Numele tău] Delivery Brașov").

### Slide 5 — Ce vinzi (produs)

**Titlu:** Pachetele HIR pe care le pune Iulian în fața clientului

| Plan | Preț | Pentru cine |
|---|---|---|
| **Free** | 0€ | Test, max 100 comenzi/lună, brand HIR în footer |
| **Plus** | 49€/lună | Restaurant solo, brand 100% propriu, AI CEO, Newsletter 1k |
| **Pro** | 149€/lună | Lanț 2-5 locații, branded mobile app, AI CEO auto-execute |
| **Custom** | Negociat | Lanțuri 6+ locații, agenții, white-label real |

> Comisionul tău de 20% înseamnă: **10 restaurante Plus = 98€/lună pasiv. 30 restaurante Pro = 894€/lună pasiv.** După Silver, plus markup-ul tău pe meniu.

### Slide 6 — Cum decurge demo-ul

**Titlu:** Demo de 20 minute cu un restaurant prospect

1. **Deschidem laptop**, intrăm pe `app.hir.ro/onboarding?ref=<codul tău>`
2. **Alegi vertical** (italian/asian/fine/bistro/românesc) — storefront se construiește în 60 secunde
3. **Importer GloriaFood** dacă au deja meniul acolo, sau wizard 5 ecrane dacă nu
4. **Telegram bot greets** în fața lor — „Bună, sunt Asistentul tău. În 5 minute învăț…"
5. **AI CEO le sugerează prima promoție** la 14:00 (lunch deal), cu 1-tap approve
6. **Closing:** „Dacă semnezi acum, 50% reducere primele 3 luni + setup gratuit asistat"

### Slide 7 — Potențial de câștig (matematică)

**Titlu:** Dacă aduci 10 restaurante în 6 luni…

| Scenariu | Comision lunar | Markup mediu | Total/lună |
|---|---|---|---|
| **10 restaurante Plus, Bronze, fără markup** | 10 × 9.8€ = **98€** | 0 | **98€/lună** |
| **10 restaurante Pro, Bronze, fără markup** | 10 × 29.8€ = **298€** | 0 | **298€/lună** |
| **10 restaurante Pro, Silver (după 5 active), 15% markup pe ~30 comenzi/lună × 80 RON valoare medie** | 10 × 22.35€ = **223€** | ~720 RON ≈ **145€** | **368€/lună** |
| **30 restaurante Pro, Gold (după 20 active), 30% markup** | 30 × 14.9€ = **447€** | ~4320 RON ≈ **870€** | **1317€/lună pasiv** |

> Toate cifrele sunt conservatoare (30 comenzi/lună e mediu modest pentru un restaurant micuț). Asta e venit pasiv — restaurantele odată semnate, încasezi lună de lună fără să te mai duci la ele.

### Slide 8 — Onboarding tău + suport ongoing

**Titlu:** Cum te ajutăm să închizi vânzări

- **Welcome kit RO**: leaflet print A4, e-book „Cum vinzi ordering la restaurante" (10 pagini), video tutorial 7 min
- **Demo account** preconfigurat — `partener-demo.hir.ro` cu 30 comenzi mock să arăți live
- **Pitch deck PowerPoint editabil** cu logo-ul tău (acest deck)
- **Slack/WhatsApp partner channel** — Iulian răspunde la întrebări tehnice <2h în zilele de lucru
- **Partner playbook 5-step** (Way to go) — primii 5 clienți, cum să-i abordezi
- **Quarterly review call** — 1-on-1 cu Iulian, feedback pe pipeline + îmbunătățiri produs

### Slide 9 — Angajamente reciproce

**Titlu:** Ce îți cerem și ce îți dăm

| Tu îmi dai | Eu îți dau |
|---|---|
| Reprezentare profesională în piață (no spam) | Marketing kit + demo + suport |
| Prețuri în limita planurilor (markup max 50% Gold) | Plată la timp, săptămânal Stripe |
| Feedback honest pe produs (bug reports + feature requests) | Roadmap public + influence pe ce shipăm |
| **NO exclusivitate** — poți vinde alte produse | Lifetime commission, transferabilă în testament :) |
| Quarterly performance review | Tier upgrade automat când îndeplinești pragurile |

### Slide 10 — Next steps

**Titlu:** Cum începi azi

1. **Sign up** la `app.hir.ro/partner/signup` cu emailul tău (3 minute)
2. **Primești invite_code** în maxim 24h (Iulian aprobă manual primii 20)
3. **Group call onboarding** vinerea, 18:00, 30 min — întrebări + demo
4. **Primii tăi 5 leads** — Iulian ți le dă din pipeline-ul lui (warm intros) ca să închizi rapid 5 ca să treci la Silver
5. **First commission payout** — la 30 de zile de la prima comandă plătită

> Întrebări? **+40 769 663 169** — Iulian. WhatsApp/SMS/voce, ce preferi.
> Email: **office.hir@yahoo.com**

---

## 8. Risk register update

Reluăm risk-urile din [Master Blueprint §13](docs/strategy/2026-04-28-hir-master-blueprint.md#13) cu observațiile sintezei.

| Risc | Probabilitate | Impact | Mitigare |
|---|---|---|---|
| GloriaFood retaliează cu feature dump sau price cut | Joasă (sunt în EOL declarat) | Mediu | AI CEO + UX simplicity hard de copiat. Banner-ul roșu îi împiedică să facă PR ofensiv. |
| Wolt/Glovo blochează brokerage | Medie | Mare | Diversificat 4 flote. Plus relațiile personale Iulian. |
| Bandwidth Iulian (single founder) | Mare | Mare | Reseller program + AI agents. Frugal merge rule. |
| Adoption RO lentă | Medie | Mediu | Free tier + simple onboarding + AI CEO daily wow. |
| Vercel/Supabase price scaling | Joasă | Mediu | Pro plans + sweat-test la 100 tenants. |
| Trade-secret claims pentru importer | Joasă | Mediu | Folosim DOAR API-ul public GitHub-published. |
| **NOU: Slerp / Hyperzod / OrderingPlus EU beat us la migratorii GloriaFood** | Medie | Mare | **Speed-to-market** (importer skeleton în S3, marketing landing în S5). **RO localization** (T&C, ANPC, copy, suport telefonic) — barieră naturală pentru competitori EN-only. **Personal brand Iulian** — relațiile cu reseller-ii GloriaFood RO existenți (HIR e deja partener), warm pipeline pe primii 50 clienți. |
| **NOU: Helpjuice KB locked us out — KB content e parțial** | Joasă (deja accepted) | Mic | 87 screenshots ([PR #38](docs/research/2026-04-28-gloriafood-firsthand-screenshots.md)) acoperă majoritatea featurilor plătite. Live scrape capturează nav structure complet. KB textual rămâne lacună minoră — nu blochează shipping-ul. |
| **NOU: Empty SPA admin pages on scrape** | n/a | n/a | NU e risc. E doar limitare tehnică Playwright fără auth flow per tab. Tab-urile mele 4 din 7 capturate cu conținut + 87 capturi manuale ne dau 95%+ acoperire. Nu mai e nimic de reverse-engineered. |
| **NOU: Reseller-ii existenți HIR refuză să recomande HIR (vor să rămână pe GloriaFood)** | Joasă (banner roșu îi forțează) | Mediu | Comm directă: „Plata ta din GloriaFood se oprește pe 30 aprilie 2027. Ce faci?". Lifetime commission lock-in pe migratorii adusi în 2026. |
| **NOU: Custom Domain DNS migration painful (Oracle deține registrul)** | Mediu | Mediu | Pentru clienții cu Custom Domain GloriaFood: explicăm că noul domain HIR îl deții 100%. Schimbarea cere DNS update — `migrate-from-gloriafood` page conține tutorial. Pentru cei care nu vor schimbare: subdomain `[brand].hir.ro` ca tranzitoriu. |

---

## 9. The 30-day execution sprint

Plan săptămână cu săptămână, începând **2026-04-29** (mâine). Owner: **Iulian** (executiv, decizional) sau **Claude/me** (implementare via agenți + PR-uri).

### Săptămâna 1 (Apr 29 – May 5) — Stabilizare + Vercel Pro

**Obiectiv:** Curățăm inbox-ul de PR-uri vechi. Vercel Pro propagă. Nu shipăm features noi.

| # | Ticket | Owner | Effort |
|---|---|---|---|
| 1 | Confirmă Vercel Pro activare + verifică limita 100 deploys/zi e ridicată | Iulian | XS |
| 2 | Batch-merge ordine: PR #21 (security), PR #27 (a11y), PR #29 (security), PR #30, PR #33 — în ordine, nu paralel | me | M |
| 3 | Smoke test post-merge: storefront Brașov demo → admin → courier → Telegram bot → email confirmare | me | S |
| 4 | Apply migrations 003/004/005/006 pe Supabase prod via API | me | S |
| 5 | Fix orice Codex review flagged pe PR-urile merge-uite (max 2h triage) | me | S |
| 6 | Schedule reminder weekly: review backlog + de-prioritize PR-uri >14 zile | Iulian | XS |
| 7 | Domain pointing `hiraisolutions.ro` final verificare (DNS, SSL) | Iulian | XS |

### Săptămâna 2 (May 6 – May 12) — Migration importer skeleton + onboarding wizard

**Obiectiv:** Skeleton-ul importer-ului funcționează end-to-end pe demo. Onboarding wizard 5 ecrane.

| # | Ticket | Owner | Effort |
|---|---|---|---|
| 8 | Schema migration: adaugă `gloriafood_id` pe `menu_categories`, `menu_items`, `menu_modifier_groups`, `menu_modifiers` | me | S |
| 9 | Schema migration: tabelă nouă `menu_item_sizes` + cols `min_select`/`max_select` pe `menu_modifier_groups` | me | S |
| 10 | Schema migration: cols `tags text[]` + `allergens jsonb` + `nutritional_values jsonb` + `kitchen_name` + `allowed_order_types text[]` pe `menu_items` | me | S |
| 11 | `packages/integration-core/src/adapters/gloriafood.ts` — Fetch Menu API v2 client cu key-paste auth | me | M |
| 12 | UI `/dashboard/onboarding/import-gloriafood` — input key + preview side-by-side + approve | me | M |
| 13 | Onboarding wizard 5 ecrane: vertical → basics → import-or-manual → branding → confirm | me | M |
| 14 | Test E2E: TESTARE demo cont GloriaFood → key extracted → import HIR → preview → confirm → storefront live | Iulian + me | S |

### Săptămâna 3 (May 13 – May 19) — Partner dashboard MVP + reseller schema

**Obiectiv:** Reseller schema deployment + 10 features partner dashboard live. Iulian poate semna primul reseller real.

| # | Ticket | Owner | Effort |
|---|---|---|---|
| 15 | Schema migration: `partners` + `partner_referrals` + `partner_commissions` + `partner_signup_requests` + `partners.imprint_*` + `partners.markup_*` | me | M |
| 16 | RLS policies pentru toate tabelele partner — `auth.uid() = partners.user_id` cascade | me | S |
| 17 | UI partner Overview cu 6 KPI cards (`apps/restaurant-admin/src/app/partner/page.tsx`) | me | M |
| 18 | UI partner Restaurants list + Add Restaurant flow | me | M |
| 19 | UI partner Performance Sales tab + Markup tab (live breakdown) | me | M |
| 20 | UI partner Branding (Imprint + Logo + Markup engine) | me | M |
| 21 | UI partner Settings (IBAN + Invite link generator + QR code) | me | S |
| 22 | Cron edge function `partner-payout-weekly` (mock pentru moment, real Stripe Connect în S5) | me | S |
| 23 | Partner welcome email RO cu link la dashboard + invite_code | me | XS |

### Săptămâna 4 (May 20 – May 26) — Free tier hard-cap + driving distance + heatmap + landing

**Obiectiv:** F1 differentiating features live. Marketing landing publicat. Iulian poate trimite traficul.

| # | Ticket | Owner | Effort |
|---|---|---|---|
| 24 | Free tier hard-cap: max 100 comenzi/lună + footer „powered by HIR" + AI CEO disabled (only digest) | me | M |
| 25 | Pricing UI `/pricing` actualizat cu planurile Free/Plus/Pro/Custom + comparare GloriaFood | me | S |
| 26 | Driving-distance delivery fee: `delivery_zones.fee_mode` + UI `/dashboard/zones/edit` + integrare OSM | me | M |
| 27 | Heatmap of out-of-zone order attempts: `/dashboard/analytics/heatmap` cu heatmap.js | me | M |
| 28 | Landing `migrate-from-gloriafood` în `apps/restaurant-web` cu hero + 5 reasons + comparison + CTA + bonus migrator | me + Iulian copy review | M |
| 29 | Allergen tags + per-size pricing + modifier min/max enforcement pe storefront | me | M |
| 30 | Cart abandonment edge fn `lifecycle-cart-abandon` (RO copy, Resend) | me | M |
| 31 | First-time-buyer + second-order discount presets în `/dashboard/promos/templates` | me | S |
| 32 | Google Ads campaign launch pe „GloriaFood alternativă" + „GloriaFood se închide" (buget 200€/lună start) | Iulian | S |

**Total tickets: 32 distincte. Săptămânal media 7-8 tickete. Ownership split: Iulian 8 (executiv) / me 24 (implementare).**

---

## 10. Rezumat strategic — 3 rânduri

1. **Banner-ul roșu GloriaFood e cea mai mare oportunitate de marketing din 2026.** Toate prioritizările Faza 1-2 sunt re-ordonate să exploateze fereastra de 12 luni.
2. **Reseller schema urcă din F2 în F1** — fără ea nu putem recruta partenerii care vor migra pipeline-ul lor GloriaFood (200-500 restaurante RO).
3. **„Adjust prices" markup engine devine feature first-class transparent la HIR** — al doilea levier economic real al programului partener, scos din ascunzișul kebab-menu și pus în T&C.

**Document de lucru. Update-uri săptămânale în S5 după primul demo de migrare. Nu se merge în main — ghidat din branch ca planificare.**

— Iulian + Claude (Opus 4.7), 29 aprilie 2026
