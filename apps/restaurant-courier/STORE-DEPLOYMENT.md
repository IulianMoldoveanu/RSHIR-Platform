# HIR Curier — Play Store Deployment Guide

Acest ghid explica pasii concreti pentru a publica HIR Curier pe Google Play Store.
iOS App Store vine ulterior (necesita cont Apple Developer + Mac cu Xcode).

---

## Pre-requisite

| Item | Cost | Cine | Status |
|------|------|------|--------|
| Google Play Developer account | $25 one-time | Iulian | TODO |
| Firebase project + google-services.json | gratis | Iulian | TODO |
| Android keystore generat | gratis | Dev | TODO |
| Secrets setate in GitHub | gratis | Dev | TODO |
| Logo 512x512 PNG + splash 1024x1024 | ~150 EUR designer | Designer | TODO |
| Privacy Policy live la /privacy | gratis, cod gata | auto | DONE |
| Termeni si Conditii live la /terms | gratis, cod gata | auto | DONE |
| Delete-account flow la /settings/delete-account | gratis, cod gata | auto | DONE |

---

## Pasul 1 — Cont Google Play Console

1. Du-te la https://play.google.com/console/
2. Creeaza cont developer (necesita card credit pentru taxa $25).
3. Accepta Developer Distribution Agreement.
4. Creeaza aplicatie noua:
   - Nume: **HIR Curier**
   - Limba default: **Romanian**
   - Tip: **App**
   - Categorie: **Business**
   - Tara release: **Romania** (poti extinde ulterior)

---

## Pasul 2 — Firebase project (pentru push notifications)

1. Du-te la https://console.firebase.google.com/
2. Creeaza un nou proiect: **hir-courier**
3. Adauga o aplicatie Android:
   - Package name: `ro.hirforyou.curier`
   - App nickname: HIR Curier Android
   - SHA-1: nu e obligatoriu pentru push (adauga-l dupa daca folosesti Google Sign-In)
4. Descarca `google-services.json`
5. Adauga-l ca GitHub Secret:
   - Mergi la repo -> Settings -> Secrets and variables -> Actions
   - Creeaza secret nou: `GOOGLE_SERVICES_JSON`
   - Valoare: continutul fisierului google-services.json (tot JSON-ul)
6. Din Firebase Console -> Project Settings -> Cloud Messaging:
   - Noteaza **Server key** (va fi folosit de Edge Function-ul `notify-courier-new-order`)

---

## Pasul 3 — Genereaza Android keystore

Ruleaza o singura data pe masina ta (sau pe un server sigur). Pastreaza fisierul la loc sigur — NICIODATA in git.

```bash
keytool -genkey -v \
  -keystore hir-courier.keystore \
  -alias hir-courier \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

La prompturi:
- **First and last name**: HIR Technology SRL
- **Organizational unit**: Engineering
- **Organization**: HIR Technology SRL
- **City**: Brasov
- **State**: Brasov
- **Country**: RO
- **Password**: alege o parola puternica si noteaz-o in vault

Dupa generare, seteaza GitHub Secrets:

```bash
# Encode keystore to base64
base64 -w 0 hir-courier.keystore
```

| Secret | Valoare |
|--------|---------|
| `ANDROID_KEYSTORE_BASE64` | output-ul comenzii base64 de mai sus |
| `ANDROID_KEY_ALIAS` | `hir-courier` |
| `ANDROID_KEY_PASSWORD` | parola cheii |
| `ANDROID_STORE_PASSWORD` | parola store-ului (poate fi aceeasi) |

---

## Pasul 4 — Build AAB prin GitHub Actions

### Optiunea A: Tag release (recomandat pentru production)

```bash
# Din radacina repo-ului
git tag courier-android-v1.0.0
git push origin courier-android-v1.0.0
```

Workflow-ul `.github/workflows/courier-android-build.yml` porneste automat si produce:
- Job `android-debug`: APK debug pentru QA
- Job `android-release`: AAB semnat pentru Play Store

Descarca AAB-ul din tab-ul **Actions -> courier-android-v1.0.0 -> android-release -> Artifacts**.

### Optiunea B: Trigger manual

1. GitHub -> Actions -> "Courier Android Build (Play Store)"
2. "Run workflow" -> Build target: `android-release`
3. Descarca artifact-ul dupa finalizare (~8-15 minute)

### Optiunea C: Build local (necesita Android Studio)

```bash
# Din apps/restaurant-courier/
pnpm cap:android:build
# Deschide Android Studio, Build -> Generate Signed Bundle/APK
```

---

## Pasul 5 — Semnare si upload in Play Console

AAB-ul produs de workflow-ul cu keystore este deja semnat cu cheia ta.

**Play App Signing (recomandat):**
1. In Play Console -> App -> Setup -> App signing
2. Alege "Use Google-managed key" sau "Upload your own signing key"
3. Daca uploadezi cheia ta: exporta certificatul de upload din keystore:
   ```bash
   keytool -export -rfc -keystore hir-courier.keystore -alias hir-courier -file upload-cert.pem
   ```
4. Upload `upload-cert.pem` in Play Console.

**Upload AAB:**
1. Play Console -> App -> Testing -> Internal testing
2. "Create new release"
3. Upload `.aab` file
4. Release notes (optional): "Versiune initiala HIR Curier"
5. Save & review -> Start rollout to Internal testing

---

## Pasul 6 — Internal Testing (3-5 zile)

1. Play Console -> Internal testing -> Testers
2. Adauga email-uri: al tau + 2-3 curieri pilot
3. Testers primesc link de instalare
4. Testeaza:
   - Login / logout
   - Accept comanda noua
   - GPS tracking (verifica in admin dashboard ca pozitia apare)
   - Fotografie dovada livrare
   - Push notification la comanda noua
   - Deep link: `hir-curier://order/[id]`
   - Offline banner cand retea pierde

---

## Pasul 7 — Pregatire pentru Production track

Inainte de release public, Play Console necesita:

### App content (Settings -> App content)

| Sectiune | Ce completezi |
|----------|---------------|
| Privacy policy | `https://courier.hirforyou.ro/privacy` |
| Ads | "This app does not contain ads" |
| App access | "All or some functionality is restricted" -> adauga cont test |
| Content rating | Completeaza chestionarul -> va da rating "Everyone" |
| Target audience | 18+ (adult workers) |
| Data safety | Completeaza (locatie, camera, push tokens — vezi mai jos) |
| Government apps | Nu |

### Data safety (Play Console -> App content -> Data safety)

| Date colectate | Tip | Scop |
|----------------|-----|------|
| Locatie precisa | Location | App functionality |
| Locatie in fundal | Location | App functionality |
| Fotografii | Photos and videos | App functionality |
| Device identifiers (FCM token) | Device identifiers | App functionality |
| Emails | Personal info | Account management |
| Nume | Personal info | Account management |

Toate sunt **criptate in tranzit**: DA
Utilizatorul poate solicita stergere datelor: DA (link /settings/delete-account)

### Store listing

- **Titlu**: HIR Curier
- **Short description** (80 chars max): Aplicatia curierilor HIR. Comenzi, GPS, castiguri in timp real.
- **Full description**: scrie 3-5 paragrafe despre ce face app-ul
- **Screenshots**: minim 2 screenshots telefon (1080x1920 sau 1440x2560)
- **Feature graphic**: 1024x500 PNG
- **App icon**: 512x512 PNG (acelasi ca icon-512.png din public/)

---

## Pasul 8 — Promote la Production

1. Play Console -> Testing -> Internal testing -> Promote release -> Production
2. Alege: "Full rollout" (sau 10% pentru cautela)
3. Review time: de obicei cateva ore, poate fi 1-3 zile la prima submisie

---

## Update workflow (dupa prima publicare)

### Update PWA (JavaScript/UI)
1. Push cod pe Vercel (`git push origin main`)
2. Vercel deployaza automat
3. Toti curierii primesc update-ul INSTANT — nu trebuie rebuild nativ

### Update nativ (plugin nou, permisiune noua, icon)
1. Incrementeaza `versionCode` in `android/app/build.gradle`
2. Triggereaza workflow: `git tag courier-android-v1.0.1 && git push origin courier-android-v1.0.1`
3. Descarca AAB din Actions artifacts
4. Upload in Play Console -> Creeaza release nou

---

## Troubleshooting

### "google-services.json not found"
- Seteaza secret `GOOGLE_SERVICES_JSON` in GitHub Settings -> Secrets

### Build fails cu "Keystore file not found"
- Verifica secretele `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS`, etc.

### "Package name already taken" in Play Console
- Package name `ro.hirforyou.curier` este unic — daca apare aceasta eroare inseamna ca o versiune anterioara a fost publicata cu acelasi package name de catre alt cont. Contacteaza Google Play Support.

### Geolocation nu functioneaza in background pe Android
- Verifica ca `ACCESS_BACKGROUND_LOCATION` este in AndroidManifest.xml (setat de Capacitor)
- Pe Android 10+: utilizatorul trebuie sa selecteze "Allow all the time" (nu doar "While using")
- Dialogul de rationale pentru background location este in `dashboard/shift/page.tsx`

### Push notifications nu sosesc
- Verifica `google-services.json` este real (nu stub-ul din CI)
- Verifica ca FCM Server Key este setat in Edge Function `notify-courier-new-order`
- Verifica ca tokenul FCM este inregistrat in tabela `courier_push_tokens`

---

## Apple App Store (ulterior)

Necesita:
- Apple Developer Program: $99/an (https://developer.apple.com)
- Mac cu Xcode instalat (sau GitHub-hosted macOS runner ~$0.08/min)
- APNs Auth Key (.p8) din Apple Developer portal
- Provisioning profile + distribution certificate

Cand esti gata: vezi `apps/restaurant-courier/mobile/README.md` sectiunea "iOS signing".
