# Play Store Submission — Quick Start pentru Iulian

**Status cod:** ✅ Capacitor Android wrapper MERGED pe main (PR #779, 2026-05-28). Toate native plugins active (geo + camera + push + deep-link + local-notify + network + preferences). Privacy policy + Terms + Account deletion live.

**Documentația completă tehnică:** `apps/restaurant-courier/STORE-DEPLOYMENT.md`

---

## Ce trebuie să faci TU concret (cumulative ~2 ore)

### 1. Google Play Developer Account ($25 one-time)

1. Du-te la [play.google.com/console](https://play.google.com/console/u/0/signup)
2. Sign in cu Google account-ul tău business (iulian@hir.ro sau similar)
3. Accept Developer Agreement
4. **Account type**: Organization (HIR SRL) — vei putea adăuga branding business proper. SAU "Individual" instant.
5. Plătește **$25 one-time fee**
6. Verifică identitate (~1-2 ore aprobare Google)
7. **DONE** — ai acces la Play Console

⏱️ Effort: 15 min + așteptare 1-2 ore aprobare

### 2. Firebase Cloud Messaging (FCM) project — pentru push notifications

1. Du-te la [console.firebase.google.com](https://console.firebase.google.com/)
2. Click "Add project" → "HIR Curier"
3. Disable Google Analytics dacă nu vrei
4. **Add Android app**:
   - Package name: `ro.hirforyou.curier`
   - App nickname: "HIR Curier"
   - SHA-1: vine după ce generăm keystore (pas 3)
5. Download `google-services.json` → trimite-mi-l (sau adaugă ca GitHub Secret `GOOGLE_SERVICES_JSON_BASE64`)

⏱️ Effort: 10 min

### 3. Generate Signing Keystore — eu pot face dacă vrei

```bash
keytool -genkey -v -keystore hir-curier-release.keystore -alias hir-curier -keyalg RSA -keysize 2048 -validity 25000
```

Întrebări input:
- Parolă keystore: **(păstrează-o sigur!)**
- First/last name: "HIR Curier"
- Organization: "HIR SRL"
- City: "Brașov"
- Country: "RO"

**OUTPUT**: `hir-curier-release.keystore` file.

Apoi:
```bash
# Encode pentru GitHub Secret
base64 -w 0 hir-curier-release.keystore > keystore.b64
```

Adaugă în GitHub Repo Settings → Secrets:
- `ANDROID_KEYSTORE_BASE64` = conținut `keystore.b64`
- `ANDROID_KEYSTORE_PASSWORD` = parola keystore
- `ANDROID_KEY_ALIAS` = `hir-curier`
- `ANDROID_KEY_PASSWORD` = parola key

⏱️ Effort: 15 min

**ALTERNATIVE:** Te ajut eu pas-cu-pas când îmi spui "go keystore" — îți generez comenzile exacte.

### 4. Build primul AAB (Android App Bundle)

Trigger GitHub Actions workflow:
```bash
gh workflow run courier-android-build.yml --ref main -F build_type=release
```

SAU manual din UI: GitHub → Actions → "Courier Android Build" → Run workflow

⏱️ Build time: ~10-15 min în GitHub Actions cloud (zero cost Mac)

### 5. Upload la Play Console — Internal Testing track

1. Play Console → HIR Curier → "Testing" → "Internal testing"
2. Create release → Upload AAB de la GitHub Actions
3. Adaugă testers (email-uri): tu + 2-3 curieri pilot deliveryhouse
4. Go live → testers primesc link instant install
5. Testeaza 3-5 zile

### 6. Assets necesare pentru Production submission

| Asset | Specificații | Status |
|---|---|---|
| App icon | 512×512 PNG | ⚠️ Placeholder (designer polish) |
| Feature graphic | 1024×500 JPG/PNG | ⚠️ TODO designer |
| Screenshots phone | min 2, max 8, 1080×1920 sau higher | ⚠️ Vom face când avem app live |
| Screenshots 7" tablet | min 2 (opțional) | Skip dacă tablet not target |
| Privacy policy URL | https://courier.hirforyou.ro/privacy | ✅ Live după Vercel deploy |
| Short description | max 80 chars | "HIR Curier — Livrare comenzi pentru restaurante RO" |
| Full description | max 4000 chars | (vom scrie împreună) |
| App category | "Business" | ✅ |
| Content rating | "Everyone" | ✅ |
| Data safety form | Declară: location, photos, push token | ✅ Avem privacy policy să citez |

### 7. Production Submission

După 3-5 zile Internal Testing OK:
1. Play Console → "Production" → "Create release"
2. Promote AAB de la Internal Testing
3. Add release notes RO: "Lansare oficială HIR Curier — gestionezi comenzile, vezi câștigurile, urmărești livrările direct de pe telefon."
4. Submit pentru review
5. Google review: **few hours - 3 days**
6. **LIVE pe Play Store** 🚀

---

## ⚡ ORDIN execuție recomandat (next 24h)

1. **ACUM** (15 min): Subscribe Google Play Developer $25
2. **Tot acum** (10 min): Create Firebase FCM project + download `google-services.json` + share with me
3. **După aprobare Play** (1-2h): Generate keystore (eu te ghidează)
4. **După keystore** (30 min): Setup GitHub Secrets
5. **Build + upload** (1h): Trigger build workflow + upload la Internal Testing
6. **3-5 zile**: Test cu curieri pilot
7. **Production submission**: 1 click + 1-3 zile review Google

**Total: 24-72h ai HIR Curier LIVE pe Play Store.**

---

## Apple Store (iOS) — Phase 2 separate

iOS rămâne pe **PWA "Add to Home Screen"** pentru curierii cu iPhone până construim:

1. D-U-N-S Number business registration (1-2 săpt processing)
2. Apple Developer Program $99/an
3. Capacitor iOS build via cloud Mac (Codemagic sau EAS Build $20-99/mo)
4. TestFlight beta
5. App Store Connect submission

Estimat: **2-3 luni** după Play Store live. Acum prioritate = Phase 0 RO + Play Store Android.

---

## Lipsuri tehnice care vor fi rezolvate

- **App icons polish**: vom genera placeholder via AI + designer freelance (~$50-100)
- **Screenshots professional**: vom face când app e live pe Internal Testing
- **Loom video demo**: 30 sec promo video pentru Play Store listing (optional dar boost conversie)

Spune-mi când ești gata să începem pas 1 (Google Play Developer signup) și eu pregătesc placeholder assets în paralel.
