# GloriaFood Romanian Restaurants — Outreach Leads (2026-04-29)

> **Purpose.** GloriaFood retires on **30 April 2027**. This file is a starter list of Romanian restaurants currently running the GloriaFood ordering widget on their own websites, plus outreach copy for migrating them to HIR before retirement. Free / public-research only — no paid tooling.

---

## 1. Detection signature analysis

The GloriaFood widget leaves three classes of fingerprints in a customer's HTML:

| Candidate | Where it appears | Google indexability | Verdict |
|---|---|---|---|
| `<script src="https://www.fbgcdn.com/embedder/js/ewm2.js">` | Mandatory script tag the widget injects | **Near zero** — Google strips/normalizes JS src URLs aggressively. `"fbgcdn.com" site:.ro` returns 0 RO restaurant hits. | Rejected as **search** signature; kept as **HTML-confirmation** signature. |
| `<script src="https://www.foodbooking.com/widget/js/ewm2.js">` | Older variant (pre-Oracle rebrand, still served on legacy installs) | 0 indexed RO hits | Rejected. |
| `data-glf-cuid="<uuid>"` / `data-glf-ruid="<uuid>"` | The button `<span>` Google's docs tells restaurants to paste | 0 RO hits — Google doesn't index attribute values | Rejected. |
| `class="glf-button"` text `See MENU & Order` | Default English CTA | The CTA is almost always replaced with Romanian copy ("Comandă online", "Vezi meniul"), so the English string does not survive. | Rejected. |
| **Network call to `www.fbgcdn.com`** | Captured by **urlscan.io** crawls (passive-DNS / asset-graph) regardless of indexing | urlscan.io exposes a public search API — anonymous tier returns `domain:fbgcdn.com AND page.country:RO` with **115 historic scans across 30 unique RO domains**. This is the **highest-yield signal** because it bypasses Google entirely. | **Winner — primary discovery channel.** |
| `data-domain` Google-Play package `com.foodbooking.<slug>` | Each restaurant that publishes a "Branded App via FoodBooking" gets a Play Store listing under that namespace | Google indexes Play Store pages well; `"com.foodbooking" hl=ro site:play.google.com` surfaces ~10 RO-locale apps. Cross-reference the slug to a `.ro` domain. | **Winner — secondary discovery channel.** |
| Hosted GloriaFood subdomain `*.websites.gloriafood.com` | Restaurants who never bought a domain run their menu on a vendor-hosted site | urlscan finds these, but they are **not** independent restaurants worth selling to (they have no website to migrate). | Skipped. |

**Picked.** The detection pipeline used here is:

1. Query `urlscan.io` API: `domain:fbgcdn.com AND page.country:RO` → seed list of 30 unique `.ro` domains that have actually loaded the GloriaFood CDN in the last 12 months.
2. Cross-check `urlscan.io` with `domain:foodbooking.com` (older CDN) → 4 more.
3. Enumerate `play.google.com/store/apps/details?id=com.foodbooking.<slug>&hl=ro` → resolve slug to brand name → Google search the brand → confirm on the brand's own `.ro` site.
4. For each domain, fetch the homepage and confirm the GloriaFood footer string `"Sistem de comandă online gratuit pentru restaurante"` and/or visible references to `gloriafood` / `fbgcdn`.

**Rejected and why.** Pure Google text-search on the script src or `data-glf-cuid` returns ~0 RO results because (a) Google does not index attribute values, (b) it normalizes script tags out of snippets, and (c) the visible CTA is localized away. Any pipeline that depends on Google text search alone will miss the bulk of the population. urlscan.io's asset graph is the only free public source that reliably enumerates customer sites.

---

## 2. CSV table — leads

Sorted by city, then domain. Confidence levels:
- **HIGH** — domain confirmed loading `fbgcdn.com` per urlscan.io scans **and/or** page HTML carries the GloriaFood footer string (verified via WebFetch this session).
- **MED** — discovered via Play Store / brand-name cross-reference but homepage HTML did not surface the signature in this session (could be lazy-loaded, behind a button click, or the install was removed). Worth a manual eyeball before outreach.
- **LOW** — site appears to be a stale demo / unfinished install (e.g. theme placeholders).

> Unique brands: **31**. Add the 5 Pizza cu Gust city sub-domains and you get **35 outreach targets** total.

| Domain | Restaurant Name | City | Phone | Email | Social | Confidence | Source-URL |
|---|---|---|---|---|---|---|---|
| supremeburger.ro | Supreme Burger | Baia Mare | 0770 154 687 |  | facebook.com/supremeburgerbm | HIGH | https://supremeburger.ro/ |
| cosmobm.ro | Cosmo Food Baia Mare | Baia Mare |  |  |  | MED | https://www.cosmobm.ro/ |
| pizzeria-allegria.ro | Pizzeria Allegria | Bistriţa / Năsăud |  |  | facebook.com/Pizzeriaallegria | HIGH | https://pizzeria-allegria.ro/ |
| camizo.ro | Restaurant Camizo | Bucureşti (Sector 3) | +40 31 62 00 444 |  | facebook.com/camizo.ro | HIGH | https://camizo.ro/ |
| cos-restaurant-bucuresti.ro | Restaurantul Clubului Oamenilor de Ştiinţă (COS) | Bucureşti |  |  |  | HIGH | https://www.cos-restaurant-bucuresti.ro/ |
| cucinadicasa.ro | Cucina Di Casa | Bucureşti (Tineretului) | +40 735 868 318 |  | facebook.com/199026556774937 | HIGH | https://www.cucinadicasa.ro/ |
| kingrolls.ro | King Rolls (Vitan, AFI) | Bucureşti + Craiova |  |  | facebook.com/kingrolls.ro · instagram.com/kingrolls.ro | HIGH | https://kingrolls.ro/ |
| mandaloun.restaurant-mandaloun.ro | Mandaloun (Lebanese) | Bucureşti |  |  | facebook.com/RestaurantMandaloun | HIGH | https://restaurant-mandaloun.ro/ |
| mivadelivery.ro | MIVA Pub & Lounge | Bucureşti (Sector 6) | +40 771 361 364 / +40 722 882 172 |  | facebook.com/mivapubandlounge · instagram.com/mivadelivery | HIGH | https://mivadelivery.ro/ |
| suzanaribs.ro | Suzana Ribs & Wings | Bucureşti |  |  | facebook.com/suzanaribs · instagram.com/suzanaribs | HIGH | https://suzanaribs.ro/ |
| time2eat.ro | Time2Eat (Mogoșoaia / Chiajna / Buftea) | Bucureşti + Ilfov | 0757 631 631 / 0799 985 555 |  |  | HIGH | https://time2eat.ro/ |
| craftpub.ro | CRAFT Pub | Craiova | +40 775 342 099 | office@craftpub.ro | facebook.com/craftpub.ro · instagram.com/craftpub.ro | HIGH | https://craftpub.ro/ |
| restaurantardealul.ro | Restaurant Ardealul | Constanţa | 0723 591 047 / 0744 990 794 |  |  | HIGH | https://restaurantardealul.ro/ |
| robaker.ro | Ro-Baker | Constanţa |  |  |  | HIGH | https://robaker.ro/ |
| thecorner.ro | The Corner | Tulcea | +40 720 040 050 | contact@thecorner.ro | facebook.com/thecornercafe2.0 | HIGH | https://thecorner.ro/ |
| pizzacugust-galati.ro | Pizza cu Gust Galaţi | Galaţi | +40 762 860 000 |  | facebook.com/pizzacugustgalati · instagram.com/pizzacugustgalati | HIGH | https://www.pizzacugust-galati.ro/ |
| pizzacugust-tecuci.ro | Pizza cu Gust Tecuci | Tecuci | +40 785 044 344 / +40 763 771 505 |  |  | HIGH | https://www.pizzacugust-tecuci.ro/ |
| pizzacugust-barlad.ro | Pizza cu Gust Bârlad | Bârlad | +40 791 710 000 |  |  | HIGH | https://www.pizzacugust-barlad.ro/ |
| pizzacugust-buzau.ro | Pizza cu Gust Buzău | Buzău |  |  |  | MED | https://www.pizzacugust-buzau.ro/ |
| pizzacugust-focsani.ro | Pizza cu Gust Focşani | Focşani |  |  |  | MED | https://www.pizzacugust-focsani.ro/ |
| restaurantgreencity.ro | Green City Restaurant & Ballroom | 1 Decembrie (Ilfov) | 0757 756 094 | contact@restaurantgreencity.ro | facebook.com/100083225595736 · instagram.com/green_city_restaurant_ | HIGH | https://restaurantgreencity.ro/ |
| restaurantvalentina.ro | Restaurant Valentina | Motru |  |  | facebook.com/RestaurantValentinaMotru · instagram.com/restaurantvalentina6 | HIGH | https://restaurantvalentina.ro/ |
| pizzahavana.ro | Pizza Havana | Piteşti | 0757 349 655 |  |  | HIGH | https://pizzahavana.ro/ |
| pitesti-delivery.ro | Casa Rustic Piteşti (redirect target) | Piteşti | 0788 312 856 | contact@casarustic-pitesti.ro |  | HIGH | https://pitesti-delivery.ro/ |
| diamondclub.ro | Diamond Club | ? |  |  |  | MED | https://diamondclub.ro/ |
| hotelabi.ro | Hotel ABI | ? |  |  |  | MED | https://hotelabi.ro/ |
| pizzeriasenna.ro | Pizzeria Senna (GloriaFood blocked the page) | ? |  |  |  | MED | https://pizzeriasenna.ro/ |
| zadis.ro | Zadis Pizza & Pasta | Râmnicu Vâlcea | 0765 373 747 | admin@zadis.ro | facebook.com/zaddyspizza · instagram.com/zadisrmvalcea | HIGH | https://zadis.ro/ |
| elevenses.ro | Elevenses | Râşnov | 0746 538 399 |  | facebook.com/Elevenses-Râşnov · instagram.com/elevenses_rasnov | HIGH | https://elevenses.ro/ |
| saladina.ro | Saladina | Sibiu | +40 743 285 484 / +40 771 775 183 |  | facebook.com/saladinacatering | HIGH | https://www.saladina.ro/ |
| calumeasuceava.ro | Calumea | Suceava |  |  | facebook.com/calumeasuceava · instagram.com/calumeasuceava | HIGH | https://calumeasuceava.ro/ |
| epicpub.ro | EpiCentru Steak Pub | Suceava | 0747 887 887 |  | facebook.com/EpicentruSteakPub · instagram.com/epicentrusteakpub | HIGH | https://epicpub.ro/ |
| titdelivery.ro | TIT Food Delivery | Sântana de Mureş | (via Facebook) |  | facebook.com/tit.food.delivery · instagram.com/tit.food.delivery | HIGH | https://titdelivery.ro/ |
| elpasso.ro | Pizzerie El Passo | Târgu Mureş | 0744 897 340 / 0770 970 146 |  | facebook.com/El-Passo-Pizzerie-1229408310409762 | HIGH | https://elpasso.ro/ |
| kingpizza.ro | Pizza King | Târgu Mureş | 0745 80 66 61 | king@kingpizza.ro | facebook.com/king.pizzerie.restaurant | HIGH | https://kingpizza.ro/ (stg1.kingpizza.ro in scan) |
| coco-delivery.ro | Coco Delivery | ? |  |  |  | MED | https://coco-delivery.ro/ |
| xpburgers.ro | XP Burgers (stale demo, "Berlin/De" placeholder still on page) | ? — appears un-launched |  |  |  | LOW | https://xpburgers.ro/ |

> **Notes.** Several confirmed-HIGH entries lack phone/email/Facebook because the homepage WebFetch summarizer did not surface them; the data is on the contact page. Owner should pull those manually before outreach.

---

## 3. Outreach kit (RO templates)

> All templates address the owner formally (`dumneavoastră`). Fields in `{curly braces}` are personalization placeholders.

### A. Cold email — subject + body (~150 words)

**Subject options (pick one — A/B test):**

1. **`{restaurant_name}` + GloriaFood se închide pe 30 aprilie 2027 — soluție de migrare**
2. **30 aprilie 2027: GloriaFood iese din piață. Ce faceți cu comenzile online de la `{restaurant_name}`?**
3. **Migrare GloriaFood → HIR pentru `{restaurant_name}` (fără comision pe comandă)**

**Body:**

```
Bună ziua, {owner_first_name},

Am observat că {restaurant_name} folosește GloriaFood pentru
comenzile online de pe site-ul propriu — o alegere foarte bună
până acum. Vă scriu pentru că Oracle a anunțat oficial
închiderea platformei GloriaFood pe 30 aprilie 2027, iar
înregistrările noi sunt deja blocate.

HIR este o platformă românească de comenzi online + dispatch
de livrare, construită pentru cazul dumneavoastră:
  •  widget de comandă identic cu cel actual, integrabil în
     5 minute pe site-ul {restaurant_name};
  •  zero comision per comandă (taxă fixă lunară);
  •  acces direct la flotele Wolt / Glovo / Bolt pentru
     livrare, fără să angajați curieri proprii;
  •  export complet din GloriaFood, fără pierdere de meniu
     sau date clienți.

Pot să vă arăt în 15 minute o demonstrație live, săptămâna
viitoare? Răspundeți doar cu o oră convenabilă și trimit
invitația.

Multă sănătate,
Iulian Moldoveanu
HIR & Build Your Dreams S.R.L.
+40 7XX XXX XXX  •  iulian@hiraisolutions.ro
```

### B. WhatsApp / SMS short (~60 words)

```
Bună ziua, {owner_first_name}. Văd că {restaurant_name}
comenzile online merg pe GloriaFood. Probabil știți deja:
Oracle închide platforma pe 30 aprilie 2027 și nu mai
acceptă restaurante noi. Avem o soluție românească de
migrare, fără comision per comandă și cu livrare prin
Wolt/Glovo/Bolt. Vorbim 5 minute când aveți timp?
— Iulian, HIR
```

### C. Telephone script (~200 words / ~90 sec)

**0–15s — Opening (validate it's the right person):**

> "Bună ziua, mă numesc Iulian Moldoveanu de la HIR. Am sunat la `{restaurant_name}`. Vorbesc cu proprietarul / managerul restaurantului? Am o problemă concretă pe care vreau să o aduc în atenția dumneavoastră, durează maxim un minut."

**15–60s — Pain + value (aşteptaţi reacţia după "30 aprilie 2027"):**

> "Pe site-ul `{restaurant_name}` aveți butonul de comandă online de la GloriaFood. Oracle, care deține GloriaFood, a anunțat oficial că închide platforma pe **30 aprilie 2027** — asta înseamnă că peste un an comenzile online de pe site-ul dumneavoastră nu vor mai funcționa. Înregistrările noi sunt deja blocate.
>
> Noi am construit HIR special pentru această situație. Este o platformă românească, widget-ul se montează în 5 minute și — în plus față de GloriaFood — vă conectăm direct la curierii Wolt, Glovo și Bolt, deci nu trebuie să angajați șoferi proprii. Taxă fixă lunară, zero comision per comandă."

**60–90s — Close cu CTA simplu:**

> "Vreau să vă arăt o demonstrație live de 15 minute, săptămâna viitoare. Vă convine `{Tuesday}` la `{14:00}` sau preferați altă oră? Trimit invitația pe email imediat ce stabilim."

**Dacă obiectia este "mai vorbim peste 6 luni":** "Înțeleg perfect. Atunci vă propun să fixăm acum o demonstrație informativă de 15 minute, fără presiune comercială — doar ca să vedeți cum arată migrarea. Decizia rămâne integral la dumneavoastră în august–septembrie."

---

## 4. Distribution plan

**Priority order (call sheet):**

1. **Brașov region first** — pilot city for HIR Pharma; courier infrastructure already mapped. Targets: `elevenses.ro` (Râșnov, near Brașov), `cityfood.ro`-style nearby. *(In this batch only Elevenses is HIGH-confidence GloriaFood — broader Brașov pull yielded mostly non-GloriaFood independents.)*
2. **București (8 leads)** — biggest brand density, easiest ROI. Order: `cucinadicasa.ro` → `kingrolls.ro` → `mivadelivery.ro` → `suzanaribs.ro` → `time2eat.ro` → `camizo.ro` → `cos-restaurant-bucuresti.ro` → `mandaloun`.
3. **Suceava + Constanța + Pitești cluster (~6 leads)** — secondary tier, decent volume.
4. **Pizza cu Gust chain (5 city sub-domains)** — single owner, single sale, 5 locations. Target the brand owner once at HQ phone (+40 762 860 000, Galați) rather than each city.
5. **Long-tail (Sibiu, Craiova, Râmnicu Vâlcea, Tg. Mureș, Tulcea, Motru, Bârlad, Focșani, etc.)** — outreach in batches of 5 once cadence is set.

**Daily volume.** Start at **10 contacts/day** (mix: 5 cold-email Tier-A, 3 phone Tier-A, 2 WhatsApp Tier-B). Scale to **30/day** once a reply rate is established (week 2). Hard ceiling: 50/day to keep replies handle-able.

**Tracking sheet template** (Google Sheets, one row per restaurant — copy from this CSV and add):

| Column | Type | Default |
|---|---|---|
| `domain` | text | from CSV |
| `name` | text | from CSV |
| `city` | text | from CSV |
| `phone` | text | from CSV |
| `email` | text | from CSV |
| `priority` | dropdown | A / B / C |
| `first_touch_date` | date |  |
| `first_touch_channel` | dropdown | email / phone / whatsapp / FB DM |
| `reply` | dropdown | yes / no / no-reply |
| `meeting_booked` | bool |  |
| `outcome` | text | won / lost / nurture |
| `notes` | text |  |

**Cadence per lead:** day 0 cold email → day 3 WhatsApp/SMS follow-up → day 7 phone call → day 14 LinkedIn/Facebook DM → day 30 close-the-loop email.

---

## 5. Phase 3 / next steps

Things the owner can do beyond this list:

1. **Manual Facebook search.** GloriaFood's "See MENU & Order" button works on Facebook pages too. Search Facebook for restaurant pages in target cities and look for the **green "See MENU & Order"** call-to-action button under the cover photo. Each one is a confirmed GloriaFood user not in this list.
2. **Cross-reference with Google Maps.** For each city of interest, browse "restaurants" in Google Maps. Click the restaurant's website link. If the site shows a circular green chat-bubble bottom-right with "Order Online", that's GloriaFood. Visually confirm in 10 seconds per restaurant.
3. **`com.foodbooking.<slug>` Play Store enumeration.** Iterate Google searches like `"com.foodbooking.<single-letter>" hl=ro site:play.google.com` (a, b, c, …) to surface RO-locale FoodBooking branded apps. Each app maps to a restaurant. ~50 more leads achievable in 1–2 hours of manual clicking.
4. **Cuisine-specific sweeps.** This batch is heavy on pizza/burger. Re-run urlscan + Google searches with cuisine modifiers: `shaorma`, `sushi`, `kebab`, `meniul zilei`, `catering`. Different cuisine = different urlscan hit population.
5. **Premium urlscan.io account ($35/mo, cancel after 1 month).** Unlocks regex / leading-wildcard search → exhaustive enumeration of `*.ro` loading `*.fbgcdn.com`. Likely brings 100–300 more leads. Owner explicitly excluded paid tools, but $35 once is a defensible exception if the seed list converts.
6. **Wayback Machine sweep.** The Internet Archive's CDX API can be queried for pages on `*.ro` containing `fbgcdn.com` snippets. Free, but slow — runtime ~1–2 hours per cuisine vertical.
7. **Closed/dead-restaurant filter (manual).** Before each outreach batch, do a 30-second sanity check: `site:facebook.com {restaurant_name}` — last post within 90 days = alive. Skip ghost listings.

---

## Appendix — raw urlscan.io seed query

```bash
curl -sS "https://urlscan.io/api/v1/search/?q=domain%3Afbgcdn.com+AND+page.country%3ARO&size=10000" \
  -H "User-Agent: Mozilla/5.0" \
| jq -r '.results[].page.domain' \
| sed 's/^www\.//' \
| grep '\.ro$' \
| grep -v 'gloriafood.com' \
| sort -u
```

Run periodically (monthly) to harvest newly-scanned RO restaurants on GloriaFood. The list grows naturally as the GloriaFood retirement deadline approaches and merchants begin shopping for replacements.
