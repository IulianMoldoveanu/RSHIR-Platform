# HIR Curier — Play Store Assets

Toate fișierele necesare pentru publicarea HIR Curier pe Google Play Store.

**Status PNG conversion:** TOATE PNG-urile sunt generate și gata de upload (12/12).

---

## Inventory

```
play-store-assets/
├── README.md                       ← acest fișier
├── convert-svg-to-png.mjs          ← script regenerare PNG-uri (necesită `npm install sharp`)
├── feature-graphic.svg / .png      ← 1024×500 banner Play Store
│
├── icons/
│   ├── icon-master.svg             ← sursa vectorială canonică (512×512)
│   ├── icon-512.svg / .png         ← 512×512 Play Store listing icon (REQUIRED)
│   ├── icon-192.svg / .png         ← 192×192 launcher icon (foreground)
│   ├── icon-96.svg / .png          ← 96×96 legacy launcher
│   ├── icon-48.svg / .png          ← 48×48 small device
│   └── adaptive-bg.svg / .png      ← 108×108 background indigo solid pentru adaptive icon
│
├── screenshots/                    ← 6 mockup-uri 1080×1920 (SVG + PNG)
│   ├── screenshot-1-orders-feed.svg / .png
│   ├── screenshot-2-order-detail.svg / .png
│   ├── screenshot-3-gps-tracking.svg / .png
│   ├── screenshot-4-earnings.svg / .png
│   ├── screenshot-5-hepi-chat.svg / .png
│   └── screenshot-6-shift-active.svg / .png
│
├── listing-copy-RO.md              ← titlu + short + full description (română)
├── listing-copy-EN.md              ← titlu + short + full description (engleză)
├── data-safety-form.md             ← răspunsuri Data Safety questionnaire
├── content-rating.md               ← răspunsuri Content Rating IARC
└── test-account.md                 ← credențiale + instrucțiuni pentru reviewer Google
```

---

## Step-by-step upload în Play Console

Mergi la `https://play.google.com/console/` -> selectează app-ul HIR Curier.

### 1. App information

**Play Console -> Grow -> Store presence -> Main store listing**

| Câmp | Sursă |
|---|---|
| App name | `listing-copy-RO.md` -> Titlu |
| Short description | `listing-copy-RO.md` -> Short description |
| Full description | `listing-copy-RO.md` -> Full description |

Adaugă și varianta EN (English - United States) folosind `listing-copy-EN.md`.

### 2. Graphic assets

**Play Console -> Main store listing -> Graphics**

Upload în această ordine (Play Console le validează imediat):

1. **App icon**: `icons/icon-512.png` (512×512 PNG, 32-bit RGBA, max 1024 KB)
2. **Feature graphic**: `feature-graphic.png` (1024×500 PNG sau JPG, fără alpha)
3. **Phone screenshots** (minim 2, maxim 8): din `screenshots/`, ordinea recomandată:
   - `screenshot-1-orders-feed.png` (primul = hero)
   - `screenshot-2-order-detail.png`
   - `screenshot-3-gps-tracking.png`
   - `screenshot-4-earnings.png`
   - `screenshot-5-hepi-chat.png`
   - `screenshot-6-shift-active.png`

**Notă:** Play Store acceptă screenshots între 320 px și 3840 px pe oricare latură, cu raport 16:9 până la 9:16. 1080×1920 (9:16) e ideal pentru phone.

### 3. App content

**Play Console -> Policy -> App content** — completează în ordine:

1. **Privacy policy**: `https://curier.hirforyou.ro/privacy`
2. **App access** -> Add credentials: copiază din `test-account.md` (secțiunea „Instructions for Google Play reviewer")
3. **Ads**: "This app does not contain ads"
4. **Content rating**: rulează chestionarul cu răspunsurile din `content-rating.md`
5. **Target audience**: 18+ (vezi `content-rating.md`)
6. **Data safety**: completează 1:1 cu `data-safety-form.md`
7. **Government apps**: No
8. **Financial features**: No
9. **News**: No
10. **Health**: No

### 4. Categorization

**Play Console -> Store presence -> Main store listing -> Categorization**

- Category: **Business**
- Tags: **Delivery, Logistics, GPS, Courier**
- Contact email: `curier@hirforyou.ro`
- Contact website: `https://curier.hirforyou.ro`

### 5. Build upload

Workflow GitHub `courier-android-build.yml` produce AAB-ul semnat. Vezi `apps/restaurant-courier/STORE-DEPLOYMENT.md` pași 3-5 pentru build și upload.

**Play Console -> Production -> Create new release** (sau Internal testing pentru pilot).

### 6. Review and rollout

După ce toate secțiunile sunt verzi (✅), apasă **Send for review**.

Review time: 1-3 zile la prima submisie (uneori câteva ore).

---

## Regenerare PNG-uri (dacă modifici SVG-urile)

PNG-urile actuale au fost generate cu `sharp@^0.34`. Dacă editezi orice SVG, regenerează PNG-ul:

```bash
cd apps/restaurant-courier/play-store-assets
npm install --no-save sharp
node convert-svg-to-png.mjs
```

Output: 12 PNG-uri rescrise cu dimensiunile corecte.

### Alternativă cu ImageMagick (Linux / WSL / macOS)

Dacă preferi `magick` (ImageMagick 7+):

```bash
cd apps/restaurant-courier/play-store-assets
magick icons/icon-master.svg -resize 512x512  icons/icon-512.png
magick icons/icon-192.svg    -resize 192x192  icons/icon-192.png
magick icons/icon-96.svg     -resize 96x96    icons/icon-96.png
magick icons/icon-48.svg     -resize 48x48    icons/icon-48.png
magick icons/adaptive-bg.svg -resize 108x108  icons/adaptive-bg.png
magick feature-graphic.svg   -resize 1024x500 feature-graphic.png

for f in screenshots/*.svg; do
  magick "$f" -resize 1080x1920 "${f%.svg}.png"
done
```

---

## Note privind designul

- Toate assets-urile sunt **mockup-uri profesionale, NU capturi reale**
- Stilul respectă paleta HIR: indigo `#4F46E5` primary, accent `#C7D2FE`, success green `#16A34A`
- Tipografie: Inter / Segoe UI fallback (font sans-serif standard)
- Pot fi înlocuite oricând cu lucrări de designer profesionist post-launch
- Capturile reale de ecran necesită cont curier activ — recomandat după primii curieri pilot pe Internal testing

---

## Privacy / Terms / Account deletion

Verifică înainte de submisia AAB că aceste URL-uri răspund cu status 200:

| URL | Conținut așteptat |
|---|---|
| `https://curier.hirforyou.ro/privacy` | Privacy Policy completă (RO + EN) |
| `https://curier.hirforyou.ro/terms` | Termeni și Condiții (RO + EN) |
| `https://curier.hirforyou.ro/settings/delete-account` | Flow funcțional de ștergere cont |

Cele 3 pagini sunt deja live (vezi `STORE-DEPLOYMENT.md`).

---

## Contact pentru întrebări Play Console

- Email principal: `curier@hirforyou.ro`
- Backup: `iulianm698@gmail.com`
