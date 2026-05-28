# HIR Curier — Data Safety Form (Play Console)

Răspunsuri complete pentru chestionarul „Data safety" din Google Play Console -> App content -> Data safety.

Folosește acest fișier ca cheat-sheet în timpul completării formularului — câmpurile Play Console se mapează 1:1 pe secțiunile de mai jos.

---

## Secțiunea 1 — Data collection and security

| Întrebare Play Console | Răspuns |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS/TLS 1.3 obligatoriu pentru toate request-urile) |
| Do you provide a way for users to request that their data be deleted? | **Yes** — link `https://curier.hirforyou.ro/settings/delete-account` |

---

## Secțiunea 2 — Data types collected

### Location

| Data type | Collected | Shared | Processing | Optional / Required | Purpose |
|---|---|---|---|---|---|
| Approximate location | Yes | No | Processed ephemerally | Required | App functionality (zone matching, dispatch) |
| Precise location | Yes | No | Not stored long-term (last position only) | Required | App functionality (real-time tracking pentru ETA către client) |

**Detalii pentru reviewer:**
- Locația este colectată DOAR în timpul turei active (shift on/off toggle)
- Nu colectăm locația când app-ul e închis sau tura e oprită
- Background location este folosită pentru continuitate GPS în timpul livrării

### Personal info

| Data type | Collected | Shared | Optional / Required | Purpose |
|---|---|---|---|---|
| Name | Yes | No | Required | Account management |
| Email address | Yes | No | Required | Account management, communications |
| User IDs | Yes | No | Required | Account management |
| Phone number | Yes | No | Required | Account management, customer contact pentru livrare |
| Address | No | — | — | — |

### Photos and videos

| Data type | Collected | Shared | Optional / Required | Purpose |
|---|---|---|---|---|
| Photos | Yes | No | Optional | App functionality (dovada de livrare opțională) |

**Detalii pentru reviewer:**
- Singura fotografie colectată este dovada de livrare (la final de comandă)
- Stocată în Supabase Storage privat per-fleet
- Curierul poate alege să facă livrarea fără fotografie

### App activity

| Data type | Collected | Shared | Optional / Required | Purpose |
|---|---|---|---|---|
| App interactions | Yes | Yes (Sentry) | Required | Analytics, fraud prevention, crash reporting |
| In-app search history | No | — | — | — |
| Other user-generated content | No | — | — | — |

**Third-party processor:** Sentry.io (crash reporting + performance monitoring) — DPA în loc, EU data residency

### App info and performance

| Data type | Collected | Shared | Optional / Required | Purpose |
|---|---|---|---|---|
| Crash logs | Yes | Yes (Sentry) | Required | Analytics |
| Diagnostics | Yes | Yes (Sentry) | Required | Analytics |

### Device or other IDs

| Data type | Collected | Shared | Optional / Required | Purpose |
|---|---|---|---|---|
| Device or other IDs (FCM token) | Yes | Yes (Google Firebase) | Required | App functionality (push notifications) |

**Detalii pentru reviewer:**
- FCM token (Firebase Cloud Messaging) e necesar pentru notificările de comenzi noi
- Google Firebase este un essential service provider pentru push delivery

---

## Secțiunea 3 — Data not collected

Răspunde **No** explicit la:
- Financial info (no payment data in app; payouts go via fleet's bank, not via app)
- Health and fitness data
- Messages (SMS, email, other messages)
- Audio files
- Files and docs
- Calendar events
- Contacts (din phonebook-ul utilizatorului)
- Web browsing history

---

## Secțiunea 4 — Security practices

| Întrebare | Răspuns |
|---|---|
| Is all of the user data encrypted in transit? | **Yes** (HTTPS/TLS 1.3 enforced, HSTS enabled) |
| Do users have a way to request data deletion? | **Yes** (`/settings/delete-account` în app + `https://curier.hirforyou.ro/settings/delete-account` pe web) |
| Have you committed to following the Google Play Families Policy? | **No** (app nu se adresează minorilor) |
| Have you committed to following the Play Store Independent Security Review? | **No** (vom evalua post-launch) |

---

## Secțiunea 5 — Data sharing

| Categorie | Shared cu cine | Scop | Optional / Required |
|---|---|---|---|
| App interactions, crash logs, diagnostics | Sentry (Functional Software, Inc. — DBA Sentry) | Analytics, crash reporting | Required |
| Device IDs (FCM token) | Google Firebase | Push notifications delivery | Required |

**NU partajăm cu terți:**
- Locație
- Nume / Email / Telefon
- Fotografii livrare

---

## Secțiunea 6 — Privacy policy

| Field | Value |
|---|---|
| Privacy policy URL | `https://curier.hirforyou.ro/privacy` |
| Account deletion URL | `https://curier.hirforyou.ro/settings/delete-account` |

---

## Note pentru reviewer Google Play

Adaugă în câmpul „Notes for reviewer" (dacă există):

```
HIR Curier este o aplicație internă pentru curierii care lucrează cu flotele partenere ale platformei HIR (https://hirforyou.ro). Necesită un cont creat de către flotă sau restaurant — utilizatorii nu se pot înregistra direct din app.

Pentru testing, folosiți contul de test furnizat în secțiunea „App access".

Locația în background este folosită exclusiv pe durata turei active pentru calculul ETA către client (vizibil în dashboard-ul flotei și opțional pe ecranul clientului). Locația se oprește automat când curierul închide tura din interfața app-ului.

Toate datele sunt stocate în Supabase (UE region — Frankfurt) și Sentry (EU residency).

Politica completă de confidențialitate: https://curier.hirforyou.ro/privacy
```

---

## Checklist final pre-submisie

- [ ] Privacy policy live și accesibil la `https://curier.hirforyou.ro/privacy`
- [ ] Account deletion flow funcțional la `https://curier.hirforyou.ro/settings/delete-account`
- [ ] DPA cu Sentry semnat (verifică în vault)
- [ ] Toate categoriile de date completate corect în Play Console
- [ ] Test account configurat și pre-asignat la flotă DEMO
