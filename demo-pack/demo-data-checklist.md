# Pre-flight checklist demo

> **Verifică ASTA în dimineața fiecărei zile de demo, ÎNAINTE să pleci de acasă.**
> Dacă un singur item e bifat „nu", **NU** pleci la demo. Reparați mai întâi.

---

## 🟢 Verificări tehnice (15 minute)

### Tenant demo pe Vercel — `demo-pizzeria-brasov`

- [ ] Storefront live la **`hirforyou.ro/m/demo-pizzeria-brasov`** — se încarcă în <3s
- [ ] Meniu populat: **12 produse minim**, în **3 categorii** (Pizza / Burger / Băuturi)
- [ ] Fiecare produs are: poză, preț, descriere scurtă
- [ ] Cel puțin un produs este marcat „Recomandat" / „Cel mai vândut"
- [ ] Coșul funcționează — adaugi, scoți, modifici cantitate
- [ ] Checkout merge până la „Comandă trimisă" cu plată ramburs
- [ ] Plata cu cardul **funcționează în mod sandbox** (Netopia / Viva test mode)

### Admin dashboard — `admin.hirforyou.ro`

- [ ] Login funcționează cu contul demo (`demo@hirforyou.ro` / parolă în vault)
- [ ] Dashboard arată **KPI cards** cu cifre realiste (nu zerouri peste tot)
- [ ] Tab „Comenzi" are **3 comenzi mock în statusuri diferite**:
  - 1 × `Nouă` (apare cu animație nouă)
  - 1 × `În pregătire` (timer running)
  - 1 × `Livrată` (cu timp livrare afișat)
- [ ] Tab „Meniu" — produsele se editează și salvează în <2s
- [ ] Tab „Operations" / „Curieri" — harta se încarcă, vezi cel puțin un curier
- [ ] Hepi nudges panel are 2-3 sugestii vizibile (nu gol)

### Aplicație curier — `courier-beta-seven.vercel.app`

- [ ] Login curier demo funcționează
- [ ] **Cel puțin un curier are shift activ** (status: online)
- [ ] Curierul apare pe harta din admin în timp real
- [ ] Notificare push merge când vine o comandă nouă (testează pe propriul telefon)
- [ ] Click „Accept" → vezi traseu pe hartă → click „Livrat" merge fluid

### Hepi AI — Telegram & WhatsApp

- [ ] Bot Telegram `@MasterHIRbot` (sau cel demo) **online** — răspunde imediat la `/start`
- [ ] Bot conectat la tenantul `demo-pizzeria-brasov` (verifică în setări tenant)
- [ ] Test conversație ca CLIENT: scrii „vreau pizza Margherita" → Hepi confirmă + plasează comandă mock → comanda apare în admin
- [ ] Test ca PATRON: scrii „fă-mi postare Facebook pentru pizza zilei" → primești 3 variante text
- [ ] WhatsApp Business (dacă activ pe tenantul demo) — testează același flow

### Content OS demo mode

- [ ] Pagina `/dashboard/content` are **mock drafts vizibile** (postări Facebook/IG pregătite)
- [ ] Pagina `/dashboard/content/publications` arată postări „publicate" istorice
- [ ] Nu sunt erori în console / nici spinner blocat

### Backup-uri

- [ ] **Loom video 3 min** live, link Bitly funcțional (testează deschiderea într-un browser incognito)
- [ ] PDF 1-pager local pe tabletă (în Files / OneDrive offline) — funcționează FĂRĂ internet
- [ ] PDF pricing onesheet local pe tabletă, idem
- [ ] Lista obiecții salvată local pe tabletă (PDF sau Markdown viewer)

---

## 🟢 Verificări infrastructură (5 minute)

- [ ] **`hirforyou.ro/status`** — toate serviciile **verde** (web, admin, curier)
- [ ] Vercel dashboard: ultimele 3 deploy-uri **success** (web + admin + curier)
- [ ] Niciun alert critic în Sentry în ultimele 24h
- [ ] Cron-uri verzi pe Supabase (ops-alerts-tick, courier-health-monitor)
- [ ] Telegram bot răspunde la `/health` (verifică ultimul reply în Hepi internal)

---

## 🟢 Verificări fizice (10 minute)

### Tableta de demo

- [ ] **Bateria > 80%** plecând de acasă (cu încărcător de rezervă în servietă)
- [ ] Wi-Fi-ul de acasă conectat — testează deschiderea celor 5 tab-uri
- [ ] **Hotspot pe telefon activat ca backup** dacă restaurantul nu are Wi-Fi
- [ ] 4G/5G plan cu cel puțin **2 GB rămași** în lună
- [ ] Notificările toate dezactivate (mod „Do Not Disturb")
- [ ] Brightness setat la 80% (vizibil în restaurant cu lumina aprinsă)
- [ ] Tab-uri pre-deschise în ordinea demo-ului:
  1. `hirforyou.ro/m/demo-pizzeria-brasov`
  2. `admin.hirforyou.ro/dashboard`
  3. App curier (telefon separat sau tab tabletă)
  4. Telegram web cu Hepi conectat
  5. `hirforyou.ro` (homepage pentru pricing)

### Servietă / rucsac

- [ ] **PDF 1-pager printat color × 5** (la cap restaurant cere mai mult de unul)
- [ ] **PDF pricing onesheet printat color × 3**
- [ ] **Cărți de vizită × 20** (cel puțin 4-5 pe restaurant)
- [ ] Pix de calitate × 2 (unul împrumut, unul rezervă)
- [ ] Mini-bloc-notes pentru notițe rapide după demo
- [ ] **Sticker HIR** mic pentru ușa restaurantului dacă acceptă demo (cadou)

### Personale

- [ ] Cămașă curată călcată
- [ ] Pantofi curați (NU adidași — patronii sunt arhaici, respectă codul)
- [ ] Mâini curate, unghii îngrijite
- [ ] Telefon încărcat, sunet pe vibrate
- [ ] **Apă în sticlă** — vorbești 30+ min, te seci la gură
- [ ] Bani cash 100-200 lei (poate intri să consumi ca client, faci comandă reală)

---

## 🚨 Plan de criză

### Dacă pică internetul restaurantului
1. Activează hotspot-ul pe telefonul tău
2. Conectează tableta la hotspot
3. Dacă și mobile data e slow → **deschide PDF-urile offline** + linkul Loom (se buffer-ează din cache dacă l-ai văzut azi)

### Dacă pică vreun serviciu HIR
1. Verifică **`hirforyou.ro/status`** rapid (de pe alt tab)
2. Dacă-i orange/roșu → **NU intra în panică**, zi calm: „Avem o mică problemă tehnică acum, hai să-ți arăt pe video" → Loom backup
3. Trimite mesaj urgent în grupul intern HIR „🚨 demo activ — service X jos"
4. Continuă demo-ul pe cele care merg

### Dacă patronul cere ceva specific pe care nu-l ai
1. „Întrebare bună, te sun mâine cu răspuns concret. Notez acum."
2. Notezi întrebarea pe mobil
3. **Nu inventezi niciodată.** Patronul respectă „mâine îți zic exact" mai mult decât „cred că da".

### Dacă patronul vrea să semneze ACUM
1. **NU semna nimic pe loc.** Onboarding-ul pe `admin.hirforyou.ro/dashboard/admin/onboard` durează 5 minute de la tine, dar trebuie făcut **calm, după demo.**
2. Zi: „Mă bucur enorm. Acum stai liniștit, eu mă duc acasă, mâine la 9 dimineața ai contul tău creat și meniul migrat. La 18:00 azi îți trimit primul update."
3. Confirmă cu el datele cheie: nume restaurant, slug dorit, telefon, email, dacă vrea card sau cash-on-delivery la început.

---

## ✅ Post-demo (în mașină, după plecare)

- [ ] Notează în CRM (sau în notes-ul tău): nume restaurant, telefon patron, ce-a zis, status (DA / MEGA THINK / NU)
- [ ] Trimite email follow-up **în maxim 2 ore** (vezi `email-followup-template.md`)
- [ ] Dacă a zis DA — programează onboarding pentru ziua următoare 9:00 AM
- [ ] Dacă a zis NU — pune-l pe lista „re-touch în 6 luni"
- [ ] Bea apă, mănâncă ceva, treci la următorul demo

---

**Atenție:** dacă într-o zi ai mai mult de 4 demo-uri programate, **scoate unul afară**. La al 5-lea ești epuizat și pierzi calitate. Mai bine 3 demo-uri excelente decât 6 mediocre.
