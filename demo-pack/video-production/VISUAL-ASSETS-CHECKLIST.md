# Visual Assets Checklist — ce trebuie să capturezi pentru video

> **Folosește această listă ca checklist înainte să începi să înregistrezi.** Toate screen recordings au timpi sugerați și pași concreti.

---

## Setup global înainte de capture

### Browser (Chrome recomandat)

- [ ] Zoom 110-120% (text mai mare, mai citibil pe video)
- [ ] Bookmark bar ascunsă (Ctrl+Shift+B)
- [ ] Extensii dezactivate (ad-blockers pot ascunde elemente)
- [ ] Notificări OFF (Windows Focus Mode / Mac Do Not Disturb)
- [ ] Toate tab-urile preîncărcate (NU vrei loading spinner mid-recording)

### Tabs pre-loaded în ordine

1. `https://hir-restaurant-web.vercel.app/?tenant=foisorul-a` (Storefront)
2. `https://app.hirforyou.ro/dashboard` (Admin, logat cu cont demo)
3. `https://hir-restaurant-courier.vercel.app/` (Curier PWA, mock data)
4. Telegram Web → `@MasterHIRbot`
5. `https://hirforyou.ro` (Site marketing)

### Loom setup

- [ ] Loom extension instalată în Chrome
- [ ] Permisiuni Mic + Cam + Screen acordate
- [ ] Test 30 sec recording — audio clar, ecran fluid
- [ ] Resolution: 1080p (Loom Free default)

---

## Screen Recording 1 — STOREFRONT Foișorul A (45 sec)

> **Folosit în:** Segmentul 3 SOLUȚIA PLATFORMĂ (0:45-1:00)

### Pași de capturat

| # | Acțiune | Timp | Detaliu |
|---|---|---|---|
| 1 | Open storefront URL | 0:00-0:03 | Pagina principală load complet |
| 2 | Scroll meniu lent | 0:03-0:15 | Toate categoriile vizibile, poze încărcate |
| 3 | Tap pe un produs (pizza Margherita) | 0:15-0:20 | Modal cu detalii produs |
| 4 | Click "Adaugă în coș" | 0:20-0:23 | Animație coș (+1) |
| 5 | Open coș | 0:23-0:28 | Bottom drawer cu produs |
| 6 | Click "Comandă" | 0:28-0:33 | Pagina checkout |
| 7 | Completează rapid: telefon + adresă | 0:33-0:42 | Date demo: 0712345678, "Str. Demo 1, Brașov" |
| 8 | Selectează plată (cash on delivery) | 0:42-0:45 | Final screen confirmare |

### Tips

- **NU click prea repede** — pauză 1 sec pe fiecare ecran important
- **Mouse smooth** — nu sări dintr-o parte în alta
- **Dacă apare bug:** stop recording, refresh, repeat
- Recomandare: **face 2 take-uri** și alegi pe cel mai fluid

### Backup B-roll (Pexels free)

Dacă storefront pare gol/nepopulat, suprapuneți B-roll:
- "restaurant owner phone ordering" — Pexels search
- "menu food close-up" — Pexels search
- Folosit în transition între acțiuni

---

## Screen Recording 2 — ADMIN DASHBOARD (30 sec)

> **Folosit în:** Segmentul 3 SOLUȚIA PLATFORMĂ (1:00-1:30)

### Pași de capturat

| # | Acțiune | Timp | Detaliu |
|---|---|---|---|
| 1 | Open admin dashboard | 0:00-0:03 | Pagina principală cu KPI cards |
| 2 | Hover/zoom pe KPI cards | 0:03-0:08 | Comenzi azi, Venit total, Coș mediu |
| 3 | Click tab "Comenzi" | 0:08-0:13 | Lista comenzi cu statusuri diferite |
| 4 | Click pe o comandă recentă | 0:13-0:18 | Detalii comandă cu produse + client |
| 5 | Click "Marchează gata" | 0:18-0:22 | Status schimbat live |
| 6 | Click tab "Meniu" | 0:22-0:27 | Lista produse |
| 7 | Edit preț la un produs (zoom in) | 0:27-0:30 | Inline edit price |

### Tips

- **Dacă nu ai comenzi live:** plasează 3-4 mock orders în staging înainte de recording
- **Highlight KPI cards** cu mouse circle (Loom feature) — atrage atenția
- **Zoom in pe price edit** — patroni vor sa vadă "se schimbă în timp real"

---

## Screen Recording 3 — COURIER PWA (20 sec)

> **Folosit în:** Segmentul 3 SOLUȚIA PLATFORMĂ (1:30-1:45)

### Pași de capturat

| # | Acțiune | Timp | Detaliu |
|---|---|---|---|
| 1 | Open courier PWA URL | 0:00-0:03 | Logat cu cont curier demo |
| 2 | Shift overview cu comenzi assigned | 0:03-0:08 | 2-3 comenzi vizibile |
| 3 | Click pe o comandă | 0:08-0:12 | Detalii cu hartă route |
| 4 | Hartă cu pin curier + restaurant + client | 0:12-0:17 | Vedere clară traseu |
| 5 | Tap "Am ajuns" sau "Am preluat" | 0:17-0:20 | Status flow |

### Tips

- Mock data este OK — important e UX-ul vizual
- **Harta:** assigură-te că zoom-ul arată traseu clar (NU mondial)
- **Dacă curier PWA arată gol:** seed cu order test în Supabase staging înainte

---

## Screen Recording 4 — TELEGRAM HEPI AI (30 sec)

> **Folosit în:** Segmentul 4 HEPI AI (1:45-2:15) — CEA MAI WOW PARTE

### Pași de capturat

| # | Acțiune | Timp | Detaliu |
|---|---|---|---|
| 1 | Open Telegram Web cu @MasterHIRbot | 0:00-0:03 | Conversație curată (clear history demo) |
| 2 | Type ca client: "Salut, vreau o pizza Margherita și o cola" | 0:03-0:10 | Tap și ENTER cu pace natural |
| 3 | Reply Hepi (automat) | 0:10-0:15 | "Salut! Confirm: 1 pizza Margherita + 1 cola. Adresă?" |
| 4 | Type: "Str. Demo 1, Brașov" | 0:15-0:18 | Quick reply |
| 5 | Hepi confirmă comanda | 0:18-0:20 | "Gata! Comanda #4231 a plecat..." |
| 6 | SWITCH la mod patron: type "Hepi, fă-mi reclamă pentru pizza zilei pe Facebook" | 0:20-0:25 | Diferit prompt |
| 7 | Hepi generează 3 drafts | 0:25-0:30 | 3 variante text apar consecutiv |

### Tips

- **PRE-PREGĂTEȘTE mesajele patron** — copy în clipboard, paste rapid
- **Verifică Hepi răspunde live** — staging env trebuie să aibă tenant Foișorul A + Hepi conectat
- **Dacă Hepi nu răspunde în timp real:** fallback la screenshot static + animație fade-in CapCut
- **Zoom in pe drafts generate** — patroni să vadă text-ul clar

### Backup dacă Hepi e flaky

- Înregistrează conversație static, importă captură de ecran
- În CapCut, animație fade-in pentru fiecare bubble — pare conversație live
- Nu ideal, dar funcțional

---

## Screen Recording 5 — PRICING PAGE (10 sec)

> **Folosit în:** Segmentul 5 PROOF + PRICING (2:25-2:35)

### Pași de capturat

| # | Acțiune | Timp | Detaliu |
|---|---|---|---|
| 1 | Open hirforyou.ro | 0:00-0:03 | Homepage |
| 2 | Scroll la secțiunea pricing | 0:03-0:07 | "2 lei/comandă" vizibil mare |
| 3 | Hover pe "90 zile gratis" | 0:07-0:10 | Tooltip / accent vizual |

### Tips

- Opțional — poți înlocui cu text overlay direct în CapCut/HeyGen
- Dacă pricing page nu e finalizat, **skip** și folosește doar text overlays

---

## B-Roll Stock Footage (opțional)

> **Folosit în:** Segment 2 PROBLEMA (0:15-0:45)

### Surse free

| Sursă | URL | Avantaj |
|---|---|---|
| **Pexels** | pexels.com | Toate gratis, fără atribuire |
| **Unsplash** | unsplash.com (video section) | Quality high |
| **Pixabay** | pixabay.com/videos | Stock variat |
| **Mixkit** | mixkit.co | HD gratis |

### Search keywords (în engleză, calitate mai bună)

- "restaurant owner worried phone" → patron stressed (segment 2)
- "kitchen busy chef" → bucătărie aglomerată (segment 1 hook)
- "tablet pos restaurant" → tabletă în bucătărie (segment 3)
- "delivery scooter city" → curier livrare (segment 3)
- "celebration money saved" → fericire economisire bani (segment 5)
- "handshake business" → acord prietenos (segment 6 CTA)

### Download

- Click video → "Free Download" → MP4 1080p
- Salvează în folder local `assets/b-roll/`
- Import în CapCut sau HeyGen ca background pentru anumite secțiuni

---

## Music tracks recomandate

> **Pentru detalii volume + fade, vezi `SCRIPT-VIDEO-3MIN.md` per segment.**

### YouTube Audio Library (free, fără atribuire)

URL: youtube.com/audiolibrary

| Mood | Track | Lungime |
|---|---|---|
| **Intro Hopeful** | "Way Home" - Tokyo Music Walker | 3:00 |
| **Build Confident** | "Inspire" - Bensound (free version) | 2:30 |
| **WOW Energy** | "Better Days" - LAKEY INSPIRED | 4:00 |
| **Triumphant Close** | "Rise" - Andy Hunter (instrumental) | 3:30 |

### Strategie

- **1 track pentru întreg video** (mai simplu pentru editing)
- Sau **3 tracks** care se schimbă la 1:00 și 2:15 (mai dramatic dar mai mult editing)
- **Recomandare începător:** 1 track, fade-in/out natural

---

## Logo + branding assets

### Logo HIR

> **Dacă nu ai logo profesional:** folosește text "HIR" cu font **Inter Bold 200pt** pe fundal alb-portocaliu (#FF6B35).

**Source URLs (poate ai):**
- `assets/logo/hir-logo-light.png` (în repo dacă există)
- `assets/logo/hir-logo-dark.png`
- Sau generate text simplu în Canva în 5 minute

### Color palette HIR

| Color | HEX | Folosit pentru |
|---|---|---|
| **Portocaliu primar** | #FF6B35 | Logo, accent CTA |
| **Alb** | #FFFFFF | Background, text pe portocaliu |
| **Negru moale** | #1A1A1A | Text principal |
| **Verde pozitiv** | #22C55E | Numere economisire, "15.400 lei" |
| **Roșu subtle** | #DC2626 | Pain points (30% Glovo) |
| **Gri subtitle** | #6B7280 | Subtitles, captions |

### Font stack

- **Heading:** Inter Bold, Open Sans Bold, sau Montserrat Bold
- **Body:** Inter Regular sau Open Sans Regular
- **NU folosi:** Comic Sans (amator), Times New Roman (corporate stiff), Script fonts (greu de citit)

---

## Audio assets adițional (opțional)

### Sound effects

| Moment | Efect | Sursă |
|---|---|---|
| 0:00 hook | "Whoosh" subtle 0.5s | Freesound.org |
| 1:55 Hepi reply | "Ding" notification 0.3s | Freesound.org |
| 2:35 numbers reveal | "Cha-ching" cash 0.4s | Freesound.org |

### Voice-over (dacă faci HeyGen)

- **HeyGen TTS Romanian** — testat în 2026, suficient pentru content marketing
- **Pace:** 0.95 (sub normal)
- **Verifică pronunție** pentru: Glovo, WhatsApp, Hepi, lei, Foișorul A

---

## Checklist final înainte să începi capture

### Cu 24h înainte
- [ ] Tabs preîncărcate într-o sesiune Chrome separată
- [ ] Cont demo HIR cu date populated (storefront cu meniu, admin cu orders mock, courier cu route)
- [ ] Practice script vocal de 3 ori
- [ ] Microfon testat

### Cu 1h înainte
- [ ] Lumină în cameră bună
- [ ] Telefon silent + airplane mode
- [ ] Loom logged in
- [ ] Apă lângă tine

### Cu 5 min înainte
- [ ] Test recording 30 sec
- [ ] Verifică audio clar, ecran fluid
- [ ] Respiri adânc 3 ori
- [ ] Start!

---

## Output expected după capture

```
assets/
├── screen-recording-1-storefront.mp4 (45 sec, 1080p, ~25 MB)
├── screen-recording-2-admin.mp4 (30 sec, 1080p, ~17 MB)
├── screen-recording-3-courier.mp4 (20 sec, 1080p, ~12 MB)
├── screen-recording-4-hepi.mp4 (30 sec, 1080p, ~17 MB)
├── screen-recording-5-pricing.mp4 (10 sec, 1080p, ~6 MB) [opțional]
├── b-roll/
│   ├── restaurant-owner-phone.mp4 (de la Pexels)
│   ├── kitchen-busy.mp4
│   └── delivery-scooter.mp4
└── music/
    ├── way-home.mp3 (de la YouTube Audio Library)
    └── inspire.mp3 (de la YouTube Audio Library)
```

**TOTAL spațiu necesar:** ~100-150 MB pentru toate asset-urile + ~50 MB pentru video final.

---

**Iulian — pregătirea asset-urilor durează ~2 ore. Dar dacă faci toate asset-urile o singură dată, pot fi reutilizate în 10+ variante de video viitoare.**
