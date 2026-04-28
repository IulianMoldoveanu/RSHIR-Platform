# GloriaFood — observații directe din contul de partener (28 aprilie 2026)

**Autor:** Claude (Opus 4.7) pe baza a 87 capturi de ecran făcute de proprietarul HIR în propriul cont GloriaFood (program de partener / reseller activ).
**Sursa imaginilor:** `docs/research/Screenshot (410).png` ... `Screenshot (496).png` în repo-ul `hir-platform`.
**Domeniul observat:** `restaurantlogin.com/admin/...` — interfața PartnerNet + admin de restaurant pe contul de demo `TESTARE` din Brașov, sub partenerul `Iulian Moldoveanu / office.hir@yahoo.com`.
**Document complementar:** PR #34 (`docs(research): GloriaFood feature catalog + HIR gap analysis + migration plan`) acoperă materialul public. Aici acoperim doar ce se vede în spatele autentificării.

---

## DESCOPERIRE STRATEGICĂ MAJORĂ — banner roșu permanent

Pe **fiecare** ecran (toate cele 87 capturi) apare un banner roșu fix:

> **„Important: This offering will be retired on April 30, 2027. A written notice with more details and an FAQ will be sent to the email that is associated with your restaurant (or partner) account."**

GloriaFood este programat oficial pentru retragere de către Oracle pe **30 aprilie 2027**. Mai sunt **~12 luni** până când zeci de mii de restaurante (inclusiv ~200-500 din România prin partenerii ca HIR) vor avea nevoie de o platformă alternativă. Asta schimbă fundamental tonul de vânzare HIR: nu vindem doar „avem UX mai bun", vindem „ai 12 luni să migrezi de pe o platformă moartă, noi te luăm în 30 de zile". Toate prioritizările de mai jos trebuie citite prin această lentilă.

---

## 1. Sumar executiv

### Top 5 funcționalități observate care confirmă ce a catalogat deja PR #34

| # | Funcție | Confirmare directă |
|---|---------|--------------------|
| 1 | Meniu cu categorii, choices & addons (modificatori) | [Screenshot 486-491]: editor de meniu cu Pizza/Pasta/Drinks, „Choices & Addons" panel pe dreapta cu CRUSTA, Extra Toppings (Small/Large), opțiuni Optional/Mandatory, „Allow adding same choice multiple times" |
| 2 | Servicii multiple (delivery, pickup, dine-in/on-premise, table reservation) | [Screenshot 435, 436, 469]: setup wizard cu „Pickup / Delivery / Table reservation / On premise / Opening Hours / Scheduled orders" — toate cu toggle Yes/No |
| 3 | Mai multe metode de plată (cash + card on delivery + Stripe/PayPal/Braintree online) | [Screenshot 437-440, 451]: Cash per fiecare canal (Delivery/On premise/Pickup/Reservation), „Card on delivery", „Call me back and I'll tell you my card details", providers Stripe/Braintree/PayPal/Stripe Connect (Destination + Direct charge) |
| 4 | Promotion engine cu pre-made + self-made + cupoane | [Screenshot 462-467]: „Pre-made promos" (15% OFF prima comandă, 15% OFF Kickstarter), „Self-made promo" cu cupon „WINNER", afișare promo pe mobile + desktop |
| 5 | Reports / analytics complet (funnel, clienți, heatmap delivery, Google ranking, connectivity health) | [Screenshot 473-482]: Dashboard, Sales (trend + summary), Menu Insights, Online Ordering (Website Funnel, Clients, Table reservations, Google ranking, Website Visits, Delivery Heatmap, Connectivity Health, Promotions Stats), List View (Orders + Clients) |

### Top 5 funcționalități **plătite** observate pe care PR #34 nu le surprinde (sau nu le-a evidențiat ca paywall)

| # | Funcție | Preț observat | Sursă |
|---|---------|---------------|-------|
| 1 | **Custom Domain** (domeniu propriu pentru ordering) | **$25/lună** (buton „Buy now - $25/month") | [Screenshot 428] |
| 2 | **Branded Mobile App** (aplicație mobilă proprie a restaurantului, separat de „Shared mobile app") | tab dedicat în Publishing, „This app features only this restaurant" | [Screenshot 432, 450] |
| 3 | **Autopilot Sales** (campanii email auto-segmentate pe istoricul de cumpărare) | inclus, dar marker „pump up sales the more you join" — comision 20% partener pe restaurant | [Screenshot 414, 453-457] |
| 4 | **Reservation Deposit** (depozit prepaid la rezervări de masă, cu reguli de refund) | toggle plătit, integrat cu Stripe Connect | [Screenshot 452] |
| 5 | **„Sales optimized website"** (microsite generat automat optimizat pentru conversie) | „Website generation finished" → diferit de „Legacy website" cu butoane embed | [Screenshot 447, 448] |

### Top 5 cusururi de UX (oportunități de marketing pentru HIR)

| # | Observație | Sursă |
|---|------------|-------|
| 1 | **Banner roșu de „end of life" pe fiecare ecran** ocupă ~7% din viewport — anxiogenic, distrage atenția de la sarcini | toate cele 87 capturi |
| 2 | **Setup wizard cu 7+ secțiuni × 3-5 sub-pași** (Restaurant basics → Services → Payment → Taxing orders → Menu → Publishing → Payments) — clientul trebuie să dea „Next" de minim 20 ori pentru un restaurant nou | [Screenshot 435, 444, 449] |
| 3 | **Editor de meniu cu 3 niveluri de pop-over** (categorie → produs → choice & addon) și panel-uri laterale care se suprapun pe mobile; salvarea cere click pe „Save" în 3 locuri diferite | [Screenshot 486-491] |
| 4 | **Listă de promoții fără filtre, fără sortare**, status doar pe toggle eye-icon, nu se vede instant care e activă vs. expirată | [Screenshot 465, 466] |
| 5 | **Brand identity Oracle dominant** (logo Oracle în header peste „PartnerNet") — confuz pentru parteneri care vor să prezinte platforma sub propriul nume | [toate ecranele] |

---

## 2. Catalog secțiune cu secțiune

### 2.1 PartnerNet — landing și sales pitch pentru parteneri noi

PartnerNet e brandul Oracle pentru programul de revânzare. Onboarding-ul unui partener nou trece printr-un slideshow de 3 pași: **„Sell your own services" / „Earn extra from us" / „Get free sales tools"** [Screenshot 411-413]. Mesajul cheie pentru partener:

- **20% lifetime din abonamentele plătite** ale clienților referiți („When restaurants activate our paid subscriptions, **20% goes to you each month**" — [Screenshot 412])
- **Pragul de eligibilitate:** minim 5 clienți care au cumpărat servicii plătite pentru ca partenerul să încaseze comisionul
- **„No fees to become a partner"** [Screenshot 413] — onboarding gratuit, dar cere efort de vânzare
- Sub-pagina „Marketing" sub „Sell your own services" listează servicii pe care partenerul **le poate vinde el însuși** restaurantelor: flyer print outs, photo shooting, video production [Screenshot 411]. Asta e cheia: **GloriaFood vinde software, partenerul vinde servicii adiționale**.

Sidebar-ul partener în PartnerNet are **9 secțiuni mari**: Overview / Performance (cu sub: Restaurants' Sales, Autopilot Sales, Reservation deposits, Discounts (Need Mode)) / Restaurants (Management, Orders List, Pending Requests) / Sales & Marketing (Preamble, Way to go, Partner Resources, Restaurant Resources) / Branding (Imprint, Login, Generic domain, Custom domain) / Leads / Knowledge base [Screenshot 410, 415, 416].

### 2.2 Performance — rapoarte de comision pentru partener

[Screenshot 414, 415]: pagina **Autopilot Sales** are tabel cu coloane: RESTAURANT / RESTAURANT ID / MODEL / GENERATED ORDERS / GENERATED SALES / LIST PRICE / YOUR FEE — dar tabelul e gol pe contul demo („Restaurant..." placeholder). Există un buton mare „**Export**" + „Go to orders export" — semnalizează că reconcilierea de comisioane se face manual, prin export CSV, nu printr-un payout dashboard real-time. Un motiv pentru care HIR poate face mai bine: **payout instant + breakdown vizual lunar**, fără export manual.

### 2.3 Restaurants — Management & Pending Requests

[Screenshot 415]: tabel cu un singur restaurant demo „TESTARE" (Michael Weiss 9, Brașov), coloana **MODEL** afișează „Re-sell" — confirmă că modelul partenerului e **Reseller** (nu Direct Sale, nu White-Label). Coloana **PAID SERVICES** are 5 iconițe gri (probabil: Custom Domain, Branded App, Autopilot, Premium Promotions, Reservation Deposit) — toate inactive pe demo. Buton „Add Restaurant" sus.

### 2.4 Sales & Marketing — Way to go + resurse pentru parteneri

[Screenshot 416, 417]: Step-by-step ghid pentru partener nou: „Iron out your presentation skills" (familiarizare cu order-taking app + tabletă), „Start small, just go easy on a few nearby restaurants" („Have a chat with the restaurant manager to 'get the vibe'..."). Tonul e foarte casual-american, **netradus în română**.

[Screenshot 418-421]: **Partner Resources** și **Restaurant Resources** sunt biblioteci de fișiere descărcabile (PSD, PDF, JPG). Lista include: „How to customize the Order Online button", „Video - How to set up online ordering for restaurants", „Product feature list", „Product images", „Leaflet that helps you sell to restaurants which don't yet have online ordering" / „...which already have", „Freemium offer leaflet", „Poster", „Retractable banner", „Foodbooking partner logo + logo guide", „Coronavirus emergency response measures" (vechi, neactualizat din 2020). [Screenshot 422-424]: Restaurant Resources include „How to sell more during spring/holiday season", „Restaurant entrance poster", „Memo card with promo highlight", „Sticker", „Fridge magnet", „E-book: Food descriptions that make you hungry", „E-book: Menu Engineering Trilogy", „Infographic: How online food ordering & delivery are reshaping the restaurant industry", „Infographic: The Bare Naked Truth About Food Delivery Portals" (atac concurențial împotriva agregatorilor, ironic dat fiind că Oracle/GloriaFood se retrage).

### 2.5 Branding — co-brandingul partenerului

Aici e una dintre cele mai puternice descoperiri pentru thesis-ul HIR.

[Screenshot 425]: **Imprint** — partenerul setează ce contact apare pe toate restaurantele lui („All my restaurants should carry this imprint"): nume + email + telefon. Pe demo: „HIRforYOU / office.hir@yahoo.com / +40769663169". Footer mic la final: „Supported by PartnerNet card" cu link mic.

[Screenshot 426]: **Logo** — partenerul își încarcă logo-ul propriu („HIR Delivery" cu siglă albastră Phoenix pe demo) care apare în:
- Self-service admin (top-left în loc de Oracle pe ecranele de admin restaurant — confirmat în [Screenshot 435+])
- Restaurant emails (confirmările trimise clienților finali)
- Order taking app (aplicația din restaurant)

Format obligatoriu: PNG transparent, max 1304×100, „Switch back to the generic logo" e disponibil oricând.

[Screenshot 427]: **Custom domain** — tab-uri Website branding / Email branding / Knowledge base / Configuration. **Knowledge base** (KB) iese pe domeniul partenerului ca să poată fi prezentat clienților ca propriu („This will be published under your custom domain so you can share it with your restaurants").

[Screenshot 428]: tab **Configuration** — buton orange „**Buy now - $25/month**" pentru activarea domeniului propriu. Note: „This domain name must be available, it will be purchased by us directly. The domain name cannot be changed later. We cannot use a domain you already own." — **constraint critic**: Oracle cumpără domeniul în numele tău, ceea ce înseamnă că n-ai control real DNS și nu poți migra ușor.

[Screenshot 429]: tab Website branding — schemă vizuală cu „Your own domain name / Your logo / Custom title / Custom background" și „When someone signs up from this page, the account is automatically assigned to this partner account". Asta e mecanismul de **atribuire a leadurilor**: orice restaurant care se înregistrează prin domeniul partenerului devine automat al partenerului.

[Screenshot 430]: **Leads** — feature secundar: arată restaurantele independente din zona partenerului pe o hartă interactivă (Brașov pe demo, cu pin-uri verzi pentru „Restaurant 1, 2, 3"). „Show your contacts details to independent restaurants nearby" — partenerul își poate face publicate datele de contact ca să fie găsit de restaurantele care vor să se aboneze direct.

[Screenshot 431]: prezentare a portalului public pentru parteneri — „Restaurants nearby can request local help" → „We are happy to help" → „When a restaurant nearby needs help, we'll let you know" — **lead routing automat pe geo**.

### 2.6 Setup restaurant — Restaurant basics → Address

[Screenshot 433]: Restaurant basics > Name & address — formular cu Numele restaurantului, telefon (+40 prefix RO), country selector cu listă lungă (Romania selectat), Europe/Bucharest timezone, oraș (Brașov), cod poștal (500035), stradă (MICHAEL WEISS 9). Formular pe coloană dreaptă peste hartă Google interactivă pe stânga. Microcopy: „What is your restaurant's address?".

### 2.7 Services & opening hours

[Screenshot 434]: **Delivery** — hartă interactivă Brașov cu poligoane orange (Zone 1) și verde (Zone 2), toggle „Delivery status: ON". Sidebar dreapta: „Delivery status [verde]" + „Zone 1 [orange] / Zone 2 [verde]" + „Add another zone?" link orange. Microcopy: „Where do you deliver?". Nota: „For further customize delivery, please check these advanced settings." — feature avansat ascuns.

[Screenshot 435]: **Table reservation** — toggle Yes/No simplu + „Settings" accordion plat.

[Screenshot 436]: **On premise** — toggle Yes/No, sub-setting „Allow guests to order anonymously" cu link „How it works for your clients".

[Screenshot 437]: **Scheduled orders** — toggle „Allow clients to request a specific fulfillment time" + 4 accordions (Settings for pickup, delivery, on premise, Other) + „How this works outside opening hours" link.

### 2.8 Payment methods

[Screenshot 438, 439, 440]: **Payment methods** — accordion cu Cash (toggle per Delivery / On premise / Pickup / Reservation & Pre order — fiecare independent), „Card (pickup counter, delivery person, in restaurant)" cu toggle-uri identice per canal, „Call me back and I'll tell you my card details" (eufemism pentru telefon-cu-carte de credit recită — extrem de risky GDPR/PCI).

[Screenshot 451]: **Online payment providers** — Stripe / Braintree / PayPal / Stripe Connect (Destination charge) / Stripe Connect (Direct charge) — cinci opțiuni separate, partenerul poate monetiza prin Stripe Connect destinaiton charge dacă vrea procent automat.

[Screenshot 452]: **Reservation deposit** — toggle Yes, „Charge deposit amount: 1 RON per Guest" cu select per Reservation / per Guest, regulă „All reservations" sau „Only if party size exceeds 2 guests", refund policy expandabil.

### 2.9 Taking orders

[Screenshot 441]: **Order Taking App** — afișează status app conectat: device „iPhone", OS „26.3.1", iPhone 12.5, „Last successful app connection check: 30 Days 5 Hours 35 Minutes 43 Seconds ago" — text obositor de citit. Linkul „Connect with another device".

[Screenshot 442, 443]: **Alert call** — dacă comanda nu e primită în app, un sistem auto-call sună un telefon de backup („Get an alert call in case an order couldn't be pushed to the order taking app in real-time"). Microcopy „Phone number of the ordering supervisor in the restaurant: Phone number (optional)". Buton mare „Play notification" — butonul de test sună o melodie să auzi cum sună alertul.

### 2.10 Menu Setup — editorul de meniu

[Screenshot 486-491]: editorul are 3 elemente principale:
1. **Sidebar stânga** (Menu Setup activ).
2. **Coloana centrală** cu butoane „Preview & Test Ordering" (verde) + meniu cu acordeoane (Pizza / Pasta / Drinks). Fiecare categorie are imagine miniatură + drag handle.
3. **Coloana dreapta „Choices & Addons"** — listă verticală: CRUSTA / Extra Toppings (Small) / Extra Toppings (Large) / PIZZA, fiecare expandabil cu sub-opțiuni Name + Price (RON), buton Pre-select.

Formularul de creare choice cere min 4 click-uri: 1) Add Group, 2) input nume, 3) toggle Optional/Mandatory, 4) toggle „Allow adding same choice multiple times", 5) Save. Apoi pentru fiecare opțiune: Add choice → Name → Price → Save. Pentru un meniu real cu 30+ produse × 3-5 alegeri fiecare, configurarea inițială e o muncă de 4-8 ore.

[Screenshot 491]: meniu cu **dropdown „three dots" (kebab)** ascuns lângă „Preview & Test Ordering" cu opțiuni: „Show me how" / „Change theme picture" / „**Adjust prices**". Asta e o feature ascunsă, dar puternică (vezi 2.11).

### 2.11 Adjust prices — feature de markup pentru reseller

[Screenshot 493-496]: dialog **„Adjust prices"** — extrem de relevant pentru programul de revânzare:
- **Apply to:** All menu items + choices & addons / Menu items / Choices & addons (radio)
- **Prices:** dropdown cu 4 valori: „Increase with (%)" / „Increase with (RON)" / „Decrease with (%)" / „Decrease with (RON)"
- Câmp numeric „0"
- **Rounding:** None / Upwards (e.g. 7.62 → 8.00) / Downwards (e.g. 7.62 → 7.00) / Upwards to .99 (e.g. 7.62 → 7.99)
- **Preview prices** → tabel cu PRODUCT / INITIAL PRICE / NEW PRICE pe fiecare item

[Screenshot 496]: tabelul de preview arată „CROCANTA 0.00 RON / 0.00 RON", „Corn 0.70 RON / 1.20 RON", „Extra mozzarella 1.20 RON / 1.20 RON" — feature-ul aplică **markup procentual la nivel de catalog întreg** într-un singur click. Dar aici sunt totuși inconsistențe (Extra mozzarella nu s-a schimbat) — sugerează un bug sau regulă neevidentă. **Asta e ce vrea partenerul**: să poată impune un markup pe meniul restaurantului fără ca restaurantul să știe.

Important: **Adjust prices** e disponibil doar din partener-side (nu din admin-ul restaurantului), conform contextului URL (`/menu-editor/edit-screen` accesat din PartnerNet). E mecanismul concret de monetizare partener prin markup, separat de comisionul de 20%.

### 2.12 Publishing — multi-canal de distribuție

[Screenshot 444]: **Official details & policy** — formular legal cu „Restaurant legal entity name", adresa pe 2 linii, oraș/cod poștal, țara, telefon, „Tax ID Number" (CIF/CUI) + checkbox „By clicking 'Next' you represent that you are an authorized agent of the legal..."

[Screenshot 445]: **Facebook Shop Now** — wizard pentru adăugarea butonului „Order Online" pe pagina de Facebook a restaurantului („Add a direct link to your menu on your restaurant's Facebook page").

[Screenshot 446]: **Smart links** — explicit pentru Google Business Profile, Instagram, TikTok („formerly Twitter"), Yelp, TripAdvisor — generează: „Smart Menu Order link" + „Smart Table Reservation link", fiecare cu buton Copy.

[Screenshot 447]: **Sales optimized website** — generator automat de microsite, status „Website generation finished" cu CTA verde „View & edit website".

[Screenshot 448]: **Legacy website** — pentru cei care au deja site, doar embed-uri „See MENU & Order" + „Table Reservation".

[Screenshot 449]: **Shared mobile app** — restaurantul devine listing într-o aplicație partajată; status „in review" cu reguli de validare („order button published, menu inserted, app connectivity health >90%").

[Screenshot 432, 450]: **Branded mobile app** — opțiunea premium, aplicație mobilă proprie a restaurantului. Toggle Yes/No + 3 bulleți: „This app is optimized for frequent ordering / This app features only this restaurant / This app has your logo background". Iconiță colorată cu mock-up app.

### 2.13 Marketing tools (Marketing Tools sidebar)

[Screenshot 453]: **Kickstarter** — campanii pre-built pentru anunțarea ordering-ului online la clienții offline (email/SMS).

[Screenshot 454-457]: **Autopilot** — engine-ul automat de email marketing. „Run Your Email Marketing on Autopilot" → „Pre-built Campaigns that Drive Sales" → „Smart selling based on purchasing history" (segmentare automată pe istoric). „Activate Autopilot Selling? Yes/No" cu warning subtle. Bulleți: „Engage with new customers / Create repeat buyers / Bring customers back before they're gone".

[Screenshot 458]: **Campaigns** — listare campanii: „Encourage second order (60% never place a second order)", „Re-engage clients (revive interest with limited time offers)", „Cart abandonment (remind detached clients of incomplete orders)".

[Screenshot 459]: editor de campanie cu preview email pe stânga (subiect „Ai uitat de comanda în coș?", body „Nu e prea târziu să îți finalizezi comanda", buton orange „CONTINUĂ COMANDA") și sidebar dreapta cu metadata + audience + CTA „Start campaign".

[Screenshot 460]: **Website scanner** — auditează „Website Quality" pe 4 axe: visitor to order conversion / speed performance / mobile optimization / search engine optimization / security. Generează un scor static pentru pitch.

[Screenshot 461]: **Google Business Overview** — wizard de optimizare a fișei Google Business, cu mock-up de telefon.

[Screenshot 462-466]: **Promotions** — tab-uri Self-made promo / Pre-made promos. „Self-made promo" listează „Bautura gratis la a doua comandă" (cupon WINNER), „Pre-made promos" listează „15% OFF, yours for the taking" (cupon 2NDOFF, asociat cu „Autopilot - Encourage second order") + „15% OFF Your 1st Order" (cupon 4AYE08PPONSF1FQ, asociat cu Kickstarter). Coloane: STATUS (toggle eye), NAME, COUPON, USED, CREATED, ASSOCIATED WITH.

[Screenshot 467, 468]: **QR codes & Flyers** — generator de QR-uri pentru meniu/checkout cu tab-uri: SAME / DIFFERENT QR per masă, opțiune „Remove blank spaces", preview QR mare. Customizare per QR: „Customize QR code - Dine in" cu listă de servicii „Dine in", „Room service" (e.g. Hotels), „Seat delivery" (e.g. Stadiums), „Suite delivery", „Sunbeds" (e.g. Beach Bar), „Other (e.g. for anything else)" + „In-house pickup" → „Pickup & consume here". Asta e **un USP serios** pentru segmente non-restaurant: hoteluri, stadioane, plaje, conferințe.

### 2.14 Reports — analytics complet

[Screenshot 473, 474]: **Dashboard** principal — Orders / Reservations / Sales (RON) / Google ranking / Website visitors / Clients (New + Returning) — fiecare card cu „Last 7 days vs Last 7 days" comparison și averaged value. Banner „You have 3 opportunities to increase your online sales" cu CTA-uri „I want more visitors / I want more orders / I want returning clients".

[Screenshot 475]: **Sales — Summary** cu „View by Payment method" + tabel cu coloane Payment method / Nr orders / Subtotal (Tax) / Subtotal (Gross) / Delivery fee (Tax) / Delivery fee (Gross) / Tips (Gross) / Other fees (Gross) / Total. Buton Export. Granularitate fiscală foarte detaliată.

[Screenshot 476]: **Online ordering > Website funnel** — funnel cu 5 pași: Website visits / Opened the menu/reservation form / Went to checkout / Sent the order/reservation / Received confirmation. Fiecare cu count + procent. Sidebar dreapta cu CTA „Make sure you don't miss orders by keeping your app opened... Check connectivity".

[Screenshot 477]: **Clients** — chart linie cu „No data available for the selected period", legendă New clients / Returning clients (purple/blue). Sub-secțiune „Key actions to get new clients and repeat business" cu „Promote attractive offers on email and social media" + buton „Create promo".

[Screenshot 478]: **Google ranking** — modal blur „You need to have a real website domain name to see your ranking in Google. Do you already have a domain name?" cu Yes/No — gate condiționat de Custom domain.

[Screenshot 479]: **Website visits** — chart linie zilnică, segmentat pe canale Affiliate / Direct / Email / From inside your website / Organic / Paid ads / Referral / Social media (8 categorii color-coded).

[Screenshot 480, 481]: **Delivery Heatmap** — hartă Brașov cu poligoane orange (zona de livrare) și cerc verde transparent (densitate comenzi). Toggle 24 Hours / 7 Days / 1 Month / 3 Months.

[Screenshot 482]: **Promotions Stats** — chart linie cu metric switch (Count) și axă timp.

[Screenshot 483]: **List View > Orders** — tabel ID / Placed Time / Type / Client / Total / Status, gol pe demo, cu filtru „Show orders older than 30 days".

[Screenshot 484]: **List View > Clients** — tabel Name / Email / Phone / Last order / Total orders / Total spent. Pe demo apare un singur client real: „Iulian The great / recrutare_hir@yahoo.com / +40769663169 / Feb 21, 2026 / 1 order / 159.16 RON".

### 2.15 Other (Settings)

[Screenshot 485]: **Notifications** — config email pentru staff restaurant + email separat pentru notificări către clienții finali. Două nivele de routing.

### 2.16 Connectivity Health (Reports)

[Screenshot 480]: **Connectivity Health** — chart bara verde/roșie zilnică cu „100% Connectivity health (7 days)" — măsoară uptime-ul aplicației de ordering la nivel de oră. „You should aim to have a score higher than 95%". Asta e un signal de QA important pentru tablete care pică în restaurante.

---

## 3. Analiza programului de reseller (cea mai relevantă secțiune strategic)

### 3.1 Structura economică a programului

GloriaFood operează **trei modele** de partener (vizibile în coloana MODEL din [Screenshot 415]: „Re-sell"). Documentele publice menționează „Direct sale" și „White-label", dar singurul model activ pe contul HIR e **Re-sell**. Diferențele observate:

- **Re-sell:** partenerul își ia 20% din abonamentele plătite ale restaurantelor referite, GloriaFood facturează direct restaurantul, partenerul primește comision lunar prin transfer.
- **Direct sale (neobservat în capturi):** partenerul cumpără licențe în vrac la preț redus și revinde restaurantelor cu propriul markup.
- **White-label (neobservat în capturi):** partenerul prezintă platforma 100% sub propriul brand, fără mențiune Oracle/GloriaFood.

Pe contul demo, modelul activ e **Re-sell** cu **co-branding parțial** (logo HIR Delivery aplicat în Self-service admin + Restaurant emails + Order taking app, dar Oracle/PartnerNet rămâne vizibil în partener-dashboard).

### 3.2 Structura comisionului — observații directe

Din [Screenshot 412]:
- **20% lifetime** din venit recurent
- **Pragul:** 5 clienți activi cu servicii plătite
- Comision **pe abonament**, nu pe comandă (deci recurring revenue, nu transactional fee)

Din [Screenshot 414] (pagina Autopilot Sales):
- Coloana **„YOUR FEE"** pe contul demo confirmă că **fee-ul partener apare separat per restaurant**
- **„LIST PRICE"** e prețul de listă, **„YOUR FEE"** e cota partenerului — diferența curge la GloriaFood
- Tabelul e gol — partenerul HIR n-a închis încă vânzări reale prin GloriaFood

Implicație: pentru un restaurant care plătește, să zicem, $100/lună pentru Custom Domain + Branded App + Autopilot, partenerul ia $20/lună **pe viață** atâta timp cât restaurantul rămâne. **20 restaurante × $20 = $400/lună pasiv** — conservator. Dar pentru a obține asta, partenerul trebuie să găsească 5+ clienți care cumpără servicii plătite (nu doar planul gratuit).

### 3.3 Markup pe meniu — al doilea levier de monetizare

Feature-ul **Adjust prices** ([Screenshot 493-496]) e cea mai interesantă descoperire economică:
- Permite partenerului să **majoreze prețurile meniului restaurantului** cu un procent fix (Increase with %) și să rotunjească la `.99` (cea mai psihologic agresivă opțiune)
- **Restaurantul probabil nu vede** că meniul afișat clienților are prețuri umflate (din contextul URL, dialogul e accesat din PartnerNet, nu din admin restaurant)
- Combinat cu **Custom domain + Branded mobile app**, partenerul poate vinde un produs end-to-end („HIR Delivery") în care:
  - Restaurantul vede prețul real (e.g. Pizza 30 RON)
  - Clientul final vede prețul umflat (e.g. Pizza 33 RON, cu .99 rounding la 33.99 RON)
  - Diferența merge la partener ca delivery fee implicit

Asta e exact modelul **agregator alb** — clientul nu știe că e GloriaFood în spate, restaurantul nu știe că prețul e umflat, partenerul ia 10-15% pe meniu + 20% pe abonament.

**Risc:** GloriaFood probabil are clauze TOS care interzic asta sau cer transparență. **Avantaj HIR:** putem face exact asta legal și transparent ca model declarat de la început.

### 3.4 Onboarding flow pentru un restaurant referit prin partener

Din [Screenshot 429], când un restaurant se înregistrează pe **domeniul custom al partenerului** (`/restaurantlogin.com/admin/...` cu logo + culori partener):
- Contul e **automat asignat** partenerului (lead routing automat)
- Restaurantul vede logo-ul „HIR Delivery" peste tot, nu „Oracle PartnerNet"
- Email-urile de confirmare (către client final) au logo HIR
- Order taking app pe tabletă afișează logo HIR
- **Knowledge base** e pe domeniul HIR (nu pe `gloriafood.com`) — partenerul poate adăuga conținut propriu și răspunde tichete

Setup wizard pe care îl trece restaurantul: 7 secțiuni × 3-5 pași = ~25 ecrane „Next" până e go-live ([Screenshot 433-450]). **Asta e o vulnerabilitate enormă** — onboarding-ul HIR poate fi 5 ecrane (target: 10 minute, vs. estimat 2-4 ore la GloriaFood pentru un restaurant cu meniu complex).

### 3.5 Ce **nu** poate face partenerul (limitări observate)

- **Nu poate seta propriul preț de listă**: prețul abonamentului plătit e fix, stabilit de Oracle. Partenerul ia fix 20%, fără negociere.
- **Nu controlează DNS-ul domeniului custom** ([Screenshot 428]: „it will be purchased by us directly... cannot use a domain you already own") — Oracle deține registrul. Migrarea e blocată tehnic.
- **Nu vede transactional logs detaliate** — doar tabel cu sumă export CSV ([Screenshot 414]).
- **Nu poate clona/duplica setări între restaurante** — fiecare e setup-uit de la zero (vizibil în setup wizard liniar).
- **Nu poate seta reguli de pricing pe zone** (e.g. delivery fee diferit Brașov-Centru vs. Brașov-Tractorul) — doar zone geo cu eligibilitate da/nu, nu pricing variabil.
- **Nu are API public** documentat în partener-dashboard (nu apare nicăieri în 87 capturi).
- **Nu există referral tree multi-nivel** (partener care recrutează parteneri).

### 3.6 Payout — cum primește partenerul banii

**Necunoscut din capturi.** Nu există sub-pagină „Payouts" / „Earnings" / „Payment history" în sidebar-ul Performance. Tabelul gol din [Screenshot 414] cu coloana „YOUR FEE" sugerează că:
- Reconcilierea se face **lunar manual** (probabil prin email + transfer bancar)
- Pragul de payout e probabil definit în T&C, nu în UI
- Nu există **payout instant on-demand**, **threshold configurable**, **multi-currency**, **Stripe Connect to partner**

[unclear from screenshot] — confirmarea exactă a frecvenței și metodei de plată trebuie cerută partenerului direct.

### 3.7 White-label / co-branding — ce se vede vs. ce nu se vede

**Co-branding observat (pe demo cu logo HIR Delivery aplicat):**
- Logo în top-bar admin restaurant ([Screenshot 435+])
- Logo în email confirmare ordin ([Screenshot 427] preview email branding)
- Logo în order taking app pe tabletă ([Screenshot 426]: „Order taking app: See Example")

**Brand Oracle care rămâne vizibil:**
- Header-ul PartnerNet (toate ecranele de partener)
- URL `restaurantlogin.com` (poate fi mascat cu Custom domain $25/lună)
- Banner roșu „retired April 30, 2027" (Oracle, neînlăturabil)
- Footer „Supported by PartnerNet" mic în email-uri ([Screenshot 425])

**Concluzia partenerului:** co-branding-ul e suficient ca să arate decent, dar nu e white-label adevărat. Un client al partenerului care intră pe domeniul partener vede „HIR Delivery" peste tot, dar dacă caută Whois domeniului, găsește Oracle. Asta e ok pentru SMB-uri care nu fac due diligence, dar e un risc pentru lanțuri mai mari.

### 3.8 Top 3 lucruri pe care HIR le poate face mai bine la nivel de program partener

1. **Pricing override transparent + multi-tier** (Adjust prices la GloriaFood e ascuns; HIR îl declară ca feature legal explicit, cu split automat partener/restaurant raportat la fiecare comandă).
2. **Payout dashboard real-time** (nu export CSV manual): payout-uri săptămânale via Stripe Connect, threshold configurable, breakdown per restaurant per source (subscription / per-order / markup).
3. **Onboarding restaurant 10 minute** prin importer CSV/foto-meniu cu OCR, vs. wizard liniar 25-ecrane GloriaFood.

---

## 4. Inventar features plătite

| Feature | Tier / Preț observat | Ce face | Confidență |
|---------|----------------------|---------|------------|
| Custom Domain | **$25/lună** | Domeniu propriu pentru ordering page + email + KB | **Direct observat** [Screenshot 428] |
| Branded Mobile App | Tier paid (preț nevizibil) | App mobilă dedicată restaurantului (vs. Shared App generică) | **Direct observat** [Screenshot 432, 450] (paywall implicit) |
| Autopilot (Email Marketing) | Tier paid | Engine de campanii email auto-segmentate pe istoric | **Direct observat** [Screenshot 414, 453-457] (apare în „Autopilot Sales" cu YOUR FEE) |
| Reservation Deposit | Tier paid | Depozit pre-paid la rezervări masă | **Direct observat** [Screenshot 414, 452] (apare în Performance > Reservation deposits) |
| Sales Optimized Website | Probabil paid | Microsite generat automat optimizat conversie | **Inferat din UI** [Screenshot 447] (e sub Publishing, distinct de Legacy) |
| Discounts (Need Mode) | Paid (necunoscut detaliu) | Sub-secțiune Performance „Discounts (Need Mode)" | **Inferat din UI** [Screenshot 410] (apare în nav, conținut neobservat) |
| Online Payment Providers (Stripe Connect Direct/Destination) | Paid (procesing fees) | Stripe Connect Destination charge ia % automat | **Direct observat** [Screenshot 451] |
| QR Codes per masă (Different per table) | Probabil free | Customizare QR per masă (Dine in / Room service / Sunbeds...) | **Direct observat** [Screenshot 467, 468] (no upgrade prompt) |
| Adjust prices (markup la nivel de catalog) | Feature partener (nu restaurant) | Aplică markup % pe meniu + rounding .99 | **Direct observat** [Screenshot 493-496] |
| Smart links (multi-platform) | Free | Generator linkuri pentru Google/Insta/TikTok/Yelp/TripAdvisor | **Direct observat** [Screenshot 446] (no paywall) |
| Imprint / Custom logo (co-branding) | Inclus în program partener | Logo + contact partener pe toate restaurantele | **Direct observat** [Screenshot 425, 426] |
| Knowledge base (KB) pe domeniul partenerului | Inclus cu Custom Domain | Self-help center pe brand partener | **Inferat din UI** [Screenshot 427] (cere Custom Domain $25) |
| Connectivity Health monitoring | Probabil free | Uptime app în restaurant (target >95%) | **Direct observat** [Screenshot 480] (no paywall) |
| Delivery Heatmap | Probabil free | Hartă densitate comenzi cu time selector | **Direct observat** [Screenshot 481] |
| Promotions Stats | Probabil free | Chart performanță promoții | **Direct observat** [Screenshot 482] |
| Cart abandonment campaign | Inclus în Autopilot | Email automat la coș abandonat | **Direct observat** [Screenshot 459] (RO copy live) |

---

## 5. Cusururi de UX care devin argumente de vânzare HIR

| # | Cusur observat | Talking point HIR |
|---|----------------|-------------------|
| 1 | Banner roșu „retiring April 30, 2027" pe fiecare ecran | „Platforma ta moare în 12 luni. HIR e construit să dureze 10 ani. Migrare în 30 de zile, gratuit." |
| 2 | Setup wizard 7 secțiuni × 3-5 pași = ~25 ecrane | „HIR onboarding: 10 minute, 5 pași, importer CSV pentru meniu." |
| 3 | Editor meniu cu 3 niveluri pop-over + Save în 3 locuri diferite | „HIR menu editor: drag-drop single-page, autosave, fără pop-overs imbricate." |
| 4 | Reconciliere comision partener prin export CSV | „HIR partner dashboard: payout săptămânal Stripe Connect, breakdown live, fără export." |
| 5 | Custom Domain $25/lună cu Oracle care deține DNS-ul | „HIR Custom Domain: tu deții DNS-ul, gratuit pe planul B, exit clean oricând." |
| 6 | Lista de promoții fără filtre/sortare, doar toggle eye | „HIR promo center: filtru status/tip/audience, sortare, search." |
| 7 | „Last app connection check: 30 Days 5 Hours 35 Minutes 43 Seconds ago" — text exhaustiv | „HIR connectivity status: relative time + culoare semafor („verde acum / roșu de 2 zile"), single-glance." |
| 8 | Adjust prices feature ascuns sub kebab menu „three dots" | „HIR markup engine: feature first-class, declarat în onboarding, cu split transparent." |
| 9 | Knowledge base e o pagină statică, nu in-app contextual help | „HIR help: tooltips contextuale + chat live in-app + KB indexabil semantic." |
| 10 | Autopilot Selling forțează „Yes/No" categoric, fără preview | „HIR campaign builder: drag-drop trigger/action, preview email instant, A/B testing nativ." |
| 11 | Connectivity Health max 7 zile pe ecran, fără alert webhook | „HIR uptime: alerts SMS/Slack/email când scor <95%, retention 12 luni, nu 7 zile." |
| 12 | Imprint partener e formular plat fără validation real | „HIR partner identity: validare CUI ANAF auto, profile completion %, brand kit upload." |
| 13 | Co-branding parțial (Oracle rămâne în footer email + URL) | „HIR white-label adevărat: domeniul tău, footer-ul tău, fără mențiune HIR în comunicarea către client final." |
| 14 | Tonul interfeței e american-casual netradus (e.g. „get the vibe") | „HIR e nativ român, T&C în română, suport în română, copy adaptat cultural." |

---

## 6. Pattern-uri bune de copiat

| Pattern | Sursa | De ce să-l copiem |
|---------|-------|-------------------|
| **Toggle Yes/No pe mare la întrebări binare** ([Screenshot 435, 436]) | Setup wizard | Clar, single-tap, evită checkbox-ul mic |
| **Maps interactive cu zone color-coded și „Add another zone"** ([Screenshot 434]) | Delivery setup | Vizual, drag-to-edit, pattern UX matur |
| **Funnel cu 5 pași + procente** ([Screenshot 476]) | Reports > Website funnel | Pattern visual standard, ușor de citit |
| **Mock-up phone preview lângă form** ([Screenshot 442, 461, 463, 464]) | Alert call, Google business, Promotions | Pattern „form on left, mock on right" — orienteaz utilizatorul vizual instant |
| **Microcopy progresiv: „What is your restaurant's address?"** ([Screenshot 433]) | Setup conversațional | Tonul de pictogramă chestionar, nu form sec |
| **Pre-built campaigns ca template-uri** ([Screenshot 458]) | Marketing > Campaigns | „Encourage second order (60% never place a second order)" — copy convingător cu stat-bait |
| **Sales optimized website cu generation status** ([Screenshot 447]) | Publishing | Pattern „we did the work for you, ready to use" |
| **Different QR per table cu prefix configurabil** ([Screenshot 470]) | QR codes & Flyers | Genial pentru hoteluri/stadioane unde HIR ar putea expanda |
| **Imprint feature: partener își setează contact peste toate restaurantele** ([Screenshot 425]) | Branding > Imprint | Copy idea pentru HIR multi-tenant: brand owner config aplicat peste cont copii |
| **Connectivity Health cu target explicit „aim for >95%"** ([Screenshot 480]) | Reports | Standard SLA explicit setat în UI — simplu, eficient |

---

## 7. Action items prioritizate pentru HIR

### Tier 1 — Must-ship (Faza 1, săptămânile 1-6)

1. **Migration mass-import CSV/foto-meniu pentru restaurante GloriaFood** — exploit window of EOL (12 luni). [Driven by: banner roșu]
2. **Onboarding restaurant <10 min** cu wizard 5 pași max + autosave — atac direct vs. wizardul de 25 ecrane [Driven by: §2.6-2.12]
3. **Partner dashboard cu payout instant + breakdown live per restaurant** (Stripe Connect, săptămânal default, threshold custom) [Driven by: §3.6 absența]
4. **Adjust prices ca feature first-class transparent** (split partener/restaurant per comandă, declarat în T&C) [Driven by: §3.3]
5. **Custom Domain free pe planul B (vs. $25/lună)** — atac direct vs. paywall observat [Driven by: §2.5 Screenshot 428]
6. **Co-branding 100% white-label** (logo + email + URL + KB + footer) fără mențiune HIR în comunicarea către client final [Driven by: §3.7]
7. **Connectivity Health monitoring cu alerts SMS/email când scor <95%** [Driven by: §2.16]
8. **Editor meniu single-page drag-drop** cu autosave (vs. 3 niveluri pop-over) [Driven by: §2.10]

### Tier 2 — Parity (Faza 2, săptămânile 6-12)

9. **Promo engine cu pre-made templates RO** (Encourage second order, Cart abandonment, Re-engage clients) traduse + adaptate cultural [Driven by: §2.13 Screenshot 458, 459]
10. **Smart links generator** (Google Business / Insta / TikTok / Yelp / TripAdvisor) [Driven by: §2.12 Screenshot 446]
11. **Multi-channel publishing**: Facebook Shop Now button, embed widgets pentru site existent, sales-optimized microsite generator [Driven by: §2.12]
12. **Reservation deposit cu Stripe Connect** (refund policy configurable) [Driven by: §2.8 Screenshot 452]
13. **Order taking app (tablet)** cu alert call backup pe număr telefon [Driven by: §2.9 Screenshot 441-443]
14. **Reports complete**: Sales Summary cu payment method breakdown + tax/gross split [Driven by: §2.14 Screenshot 475]
15. **Delivery Heatmap** cu time selector (24h/7d/1m/3m) [Driven by: §2.14 Screenshot 481]
16. **QR codes per masă** cu prefix configurabil (Dine in / Room service / Sunbeds — atac vertical hotel/stadioane) [Driven by: §2.13 Screenshot 469, 470]

### Tier 3 — Defensive (Faza 3+)

17. **Branded Mobile App** ca tier premium (Pachet B Flagship al HIR are deja asta, doar de finalizat) [Driven by: §2.12 Screenshot 432, 450]
18. **Autopilot email marketing engine** cu segmentare pe istoric + drag-drop campaign builder [Driven by: §2.13 Screenshot 454-459]
19. **Knowledge base contextual** pe domeniul partenerului cu indexare semantică [Driven by: §2.5 Screenshot 427]
20. **Lead routing automat geo** (restaurante nearby pe hartă, request-to-help flow) [Driven by: §2.5 Screenshot 430, 431]

---

## 8. Cross-reference index — finding → screenshot

Toate cele 87 de capturi (410-496) sunt grupate aici după secțiune. Banner-ul EOL apare pe toate.

| Secțiune | Screenshots |
|----------|-------------|
| PartnerNet onboarding (3 pași Sell/Earn/Get tools, comision 20%, no-fee) | 410-413 |
| Performance > Autopilot Sales / Restaurants Management (MODEL=Re-sell, 5 paid services) | 414, 415 |
| Sales & Marketing > Way to go ghid pentru parteneri | 416, 417 |
| Partner Resources (marketing kit PSD/PDF) | 418-421 |
| Restaurant Resources (eBooks, infographics, posters, stickers) | 422-424 |
| Branding > Imprint + Logo (HIR Delivery) | 425, 426 |
| Custom Domain (4 tab-uri, $25/lună paywall, auto-assign restaurants) | 427-429 |
| Leads (hartă geo + request-to-help portal) | 430, 431 |
| Branded Mobile App (paywall implicit) | 432, 450 |
| Setup wizard restaurant: address → delivery zones → table → on-premise → scheduled | 433-437 |
| Payment methods (cash/card per canal, „call me back") | 438-440 |
| Order taking app + alert call backup | 441-443 |
| Publishing: Official details / Facebook / Smart links / SOW / Legacy / Shared App | 444-449 |
| Online payment providers (Stripe/Braintree/PayPal/Stripe Connect) | 451 |
| Reservation deposit (Stripe Connect, refund policy) | 452 |
| Marketing tools: Kickstarter / Autopilot / Campaigns / Cart abandon RO | 453-459 |
| Website scanner + Google business wizard | 460, 461 |
| Promotions: overview, mobile/desktop preview, self-made + pre-made | 462-466 |
| QR codes per masă (Dine in / Room service / Sunbeds vertical) | 467-470 |
| Integrations (Shipday Accepted Orders API) | 471 |
| Reports Dashboard + Sales Summary cu Tax/Gross/Tips | 472-475 |
| Website funnel (5 pași), Clients, Google ranking, Website visits | 476-479 |
| Connectivity Health (target >95%), Delivery Heatmap, Promotions Stats | 480-482 |
| List View Orders + Clients (Iulian The great, 159.16 RON real) | 483, 484 |
| Notifications config (staff + client emails) | 485 |
| Menu editor (Pizza/Pasta/Drinks + Choices & Addons + theme) | 486-492 |
| Adjust prices (Apply to / %/RON / Rounding / Preview) | 493-496 |

---

## 9. Imagini cu probleme / neclar

Niciuna dintre cele 87 capturi nu e coruptă sau ilizibilă. **Toate s-au putut citi.** Singurele zone unde am evitat speculația:
- **Mecanica exactă de payout** (frecvență, threshold, metodă) — nu există sub-pagină dedicată în sidebar-ul observat. Marcat `[unclear from screenshot]` în §3.6.
- **Prețul exact al Branded Mobile App** — nu apare paywall vizibil în [Screenshot 432, 450]. Marcat „preț nevizibil" în §4.
- **Discounts (Need Mode)** — apare în nav la [Screenshot 410] dar nu am o captură cu conținutul. Marcat ca „necunoscut detaliu" în §4.
- **Diferența economică Re-sell vs. Direct sale vs. White-label** — singurul model activ pe demo e Re-sell. Cele două modele alternative sunt menționate doar în public docs (acoperit de PR #34).

---

## 10. Concluzie strategică

Trei observații care ar trebui să ghideze următoarele 12 luni HIR:

1. **GloriaFood moare în aprilie 2027.** Banner-ul roșu permanent e cea mai mare oportunitate de vânzare pe care HIR o va vedea vreodată. Toate restaurantele românești care folosesc GloriaFood prin parteneri (estimat 200-500 prin HIR + alți parteneri) vor căuta înlocuitor. **Faza 1 trebuie închisă cu importer GloriaFood → HIR în max 8 săptămâni.**

2. **Modelul Re-sell + Adjust prices + Custom Domain $25/lună** e fix modelul pe care HIR Pharma îl construiește deja, dar puternic mai bine: white-label real, payout live, markup transparent, domeniu deținut de partener. Nu reinventăm — copiem și executăm de 3× mai bine pe UX. Pachet B (Flagship) e deja aliniat strategic.

3. **Programele de markup sunt levierul economic real**, nu comisionul de 20%. La 200 restaurante × 30 comenzi/lună × 3 RON markup mediu = 18,000 RON/lună profit pasiv pentru partener. Asta e ce vinde scalabilitatea ofertei HIR — nu „comision 20%", ci „markup propriu pe meniu, declarat și transparent".

---

*Document generat 28 aprilie 2026 din 87 capturi de ecran ale contului de partener GloriaFood al HIR. Nu înlocuiește PR #34 (catalog public + gap analysis); îl complementează cu detalii din spatele autentificării.*
