# Demo Verification Report — 2026-05-28

Verificare efectuată înainte de prezentările fizice la restaurante Brașov.

---

## 1. Deployments — stare live

| URL | Status | Detalii |
|---|---|---|
| `https://hirforyou.ro/` | OK (200, 1.5s) | Vercel READY, marketing page incarcata |
| `https://hir-restaurant-web.vercel.app/` | OK (200) | Alias Vercel functional |
| `https://hir-restaurant-admin.vercel.app/` | OK (200 dupa redirect) | Login page incarcata corect |
| `https://hir-restaurant-courier.vercel.app/` | OK (200) | PWA activa |
| `https://hirforyou.ro/status` | OK (200) | Pagina status functionala |
| `https://admin.hirforyou.ro/` | BROKEN — timeout HTTPS | DNS `admin.hirforyou.ro` pointeaza spre 86.35.3.192 (nginx error pages), nu spre Vercel |
| `https://courier.hirforyou.ro/` | BROKEN — timeout HTTPS | DNS `courier.hirforyou.ro` pointeaza tot spre 86.35.3.192, nu Vercel |
| `https://deliveryhouse.ro/` | NOT HIR — WordPress "Coming soon" | Domeniu WP independent, neconectat la HIR |

**Domeniile Vercel configurate corect:**
- Admin real = `app.hirforyou.ro` (nu `admin.hirforyou.ro`)
- Courier real = `curier.hirforyou.ro` (fara "o", nu `courier.hirforyou.ro`)
- Wildcard `*.hirforyou.ro` e verificat in Vercel dar HTTPS timeout — DNS Cloudflare probabil nu redirecteaza wildcard catre Vercel corect

**Vercel deploy status (la momentul verificarii):**
- restaurant-web: READY (ultimul commit main)
- restaurant-admin: BUILDING (deploy in curs)
- restaurant-courier: READY

---

## 2. Tenant + Date Demo

### Tenant "foisorul-a" — EXISTA in DB, SEEDED
- `https://hir-restaurant-web.vercel.app/?tenant=foisorul-a` — incarca meniu FOISORUL A (confirmat)
- Seed rule dat in 2026-05-05 conform README: ~250 clienti, ~700 comenzi 30 zile, ~140 recenzii, 4 curieri demo

### Tenant "demo-pizzeria-brasov" — NU EXISTA
- Slug `demo-pizzeria-brasov` nu apare nicaieri in codebase sau baza de date
- Script-urile de seed din `scripts/demo-seed/` creeaza sluguri: `demo-pizzerie-mica`, `demo-fast-food-activ`, `demo-restaurant-familial`, `demo-cofetarie`
- Aceste slug-uri nu au fost seeded pe productie (testul `?tenant=demo-pizzerie-mica` intoarce marketing page, nu meniu)

### Tenant "deliveryhouse" — NU EXISTA ca tenant HIR
- `hirforyou.ro/m/deliveryhouse` returneaza "Produs negasit" deoarece `/m/[slug]` este ruta pentru un PRODUS individual (shortId), nu pentru un tenant
- URL-ul corect de storefront pentru un tenant este: `https://hir-restaurant-web.vercel.app/?tenant=<slug>` (pe Vercel preview) sau `<slug>.hirforyou.ro/` (daca DNS wildcard e fixat)

### Concluzie date demo
- Singurul tenant cu date reale disponibil pentru demo este `foisorul-a` via URL `https://hir-restaurant-web.vercel.app/?tenant=foisorul-a`
- Slugul promovat in materiale (`demo-pizzeria-brasov`) nu exista — trebuie inlocuit

---

## 3. Flow-uri E2E — stare

| Flow | Status | Note |
|---|---|---|
| Client storefront — incarcare meniu | OK pe `hir-restaurant-web.vercel.app/?tenant=foisorul-a` | Functional |
| Client storefront — coș + checkout COD | NEVERIFICAT direct (necesita sesiune browser) | Infrastructura OK daca tenant are cod_enabled=true |
| Admin login la `hir-restaurant-admin.vercel.app` | OK (pagina login incarcata) | Necesita cont demo (`admin@hir.local` / `RSHIRdev2026` conform seed.sql) |
| Admin dashboard — comenzi / meniu | NEVERIFICAT (necesita login) | |
| Courier login la `hir-restaurant-courier.vercel.app` | OK (pagina incarcare) | |
| Hepi bot `@MasterHIRbot` | NEVERIFICAT (necesita test manual Telegram) | |
| `hirforyou.ro/status` | OK | Pagina exista si incarca |

---

## 4. Materiale demo-pack — evaluare

### 1-pager-A4.md
- Continut solid, patron-friendly, fara jargon
- Testimonial deliveryhouse OK pentru social proof chiar daca domeniu nu e conectat la HIR
- Calculul economii (66.000 lei/luna vs Glovo) corect si convingator
- QR placeholder corect — trebuie generat real inainte de print (link catre `hirforyou.ro/demo` sau Bitly Loom)
- Trial 90 zile mentionat (consistent cu pricing LOCKED)

### walkthrough-script.md
- PROBLEMA: mentioneaza `hirforyou.ro/m/demo-pizzeria-brasov` — URL gresit (ruta /m/ e pentru produse individuale, nu storefront)
- PROBLEMA: mentioneaza `admin.hirforyou.ro/dashboard` — domeniu HTTPS broken, URL corect = `app.hirforyou.ro/dashboard`
- Segmentele demo (Hook / Storefront / Admin / Hepi / Curier / Pret) bine structurate pentru 30-45 min
- Replicile sunt naturale, patron-friendly

### objections-handler.md
- 10+5 bonus obiectii acoperite complet
- Ton corect: scurt, fara jargon, 1-2 propozitii
- Calculul Glovo (obiecție 3) matematic corect
- Regula de aur (tacerea) — buna tactică de vanzare

### pricing-onesheet.md
- Tabel comparativ HIR vs GloriaFood vs Glovo vs DIY complet
- Calculul 66.000 lei/luna economisit consistent cu 1-pager
- Nota de subsol pentru cifrele Glovo (estimative) — corect, protejeaza Iulian de contestatii

### loom-recording-script.md
- Script 3 minute bine impartit pe segmente (Hook / Storefront / Admin / Hepi / Pret / CTA)
- Loom-ul nu a fost inca inregistrat (nu exista link Bitly `bit.ly/hir-demo-3min` real)
- Setup tehnic clar

### demo-data-checklist.md
- Mentioneaza `hirforyou.ro/m/demo-pizzeria-brasov` — slug gresit
- Mentioneaza `courier-beta-seven.vercel.app` — alias Vercel valid, functional
- Checklist fizic (baterie, hotspot, imbracaminte) excelent
- Plan de criza bine gandit

### email-followup-template.md
- 3 variante (DA / MA GANDESC / NU) complete si patron-friendly
- Link `bit.ly/hir-demo-3min` e placeholder — trebuie inlocuit cu link real dupa inregistrarea Loom
- Cadenta follow-up (Ziua 0 / 4-5 / 14 / stop) corecta
- Ton RO formal corect

---

## Actiuni necesare INAINTE de demo (responsabil: Iulian + agent)

### CRITIC — blocheaza demo-ul
1. **Fixeaza URL storefront in materiale**: inlocuieste `hirforyou.ro/m/demo-pizzeria-brasov` cu `hir-restaurant-web.vercel.app/?tenant=foisorul-a` (sau creeaza alias scurt)
2. **Fixeaza URL admin in materiale**: inlocuieste `admin.hirforyou.ro` cu `app.hirforyou.ro`
3. **Verifica cont demo admin**: testeaza login `admin@hir.local` pe `app.hirforyou.ro`

### IMPORTANT — influenteaza calitatea demo-ului
4. **Inregistreaza Loom-ul**: 3 minute, folosind URL-urile corecte de mai sus; genereaza link Bitly real
5. **DNS wildcard *.hirforyou.ro**: verifica in Cloudflare ca wildcard pointeaza corect la Vercel (IP 76.76.21.21), altfel subdomenii tenant nu functioneaza HTTPS
6. **Ruleaza seed-ul segment demo**: `node scripts/demo-seed/pizzerie-mica.mjs` pentru un tenant Brasov mai relevant pentru pitch-ul local (optional - foisorul-a e suficient)

### OPTIONAL — polish
7. **QR cod real**: genereaza la qr-code-generator.com cu link `hirforyou.ro/demo`, adauga in 1-pager
8. **Printare**: 1-pager + pricing-onesheet color A4, minimum 5 bucati fiecare
