# Arhivă — funcții planificate, nu construite încă

Fișiere mutate aici din `supabase/functions/` pe 2026-07-25, în cadrul unui
audit de simplificare a platformei (owner-ul a semnalat 65 de Edge Functions
active ca fiind "prea multe, overwhelming").

Toate cele 7 funcții de mai jos sunt stub-uri scrise pe 2026-06-16 din
"Strategy Master Plan Section 6" — niciuna nu a fost vreodată deployată live
pe Supabase (verificat via Management API la momentul arhivării), niciuna nu
e apelată din `apps/*`, și fiecare are `NOT YET LIVE` + un `TODO: real impl`
explicit în cod. Nu sunt bug-uri — sunt planificare prematură față de
Delivery House, care e faza curentă.

## Ce conțin

| Funcție | Scop planificat |
|---|---|
| `ai-dispatch-match` | Match curier↔comandă cu ranking contextual (distanță, încărcare, reguli flotă) |
| `ai-fraud-score` | Scor de anomalie pentru KYC/plăți/comenzi |
| `ai-menu-ocr` | OCR poză meniu → listă structurată de produse |
| `ai-pricing-suggest` | Preț dinamic de livrare per zonă/oră |
| `ai-quality-summary` | Sumar sentiment recenzii per vendor/curier/flotă |
| `ai-support-intent` | Clasificator intenție suport (Hepi) + răspuns automat |
| `ai-vendor-brand-copy` | Generare copy brand vendor (RO/EN) din brief scurt |

## Ordinea de reactivare (per direcția owner-ului, 2026-07-25)

Focus actual: **consolidare + simplificare + flux demonstrabil pe Delivery
House**. HIR Curier e gândit ca hub multi-sursă (Pharma + RSHIR SaaS +
viitorul agregator HIR4You), dar aceste funcții AI nu sunt necesare pentru
niciuna din primele faze:

1. Delivery House (acum) — NU are nevoie de AI dispatch/pricing/OCR.
2. Extindere la alți vendori RSHIR — posibil relevante `ai-quality-summary`,
   `ai-support-intent` dacă volumul de suport crește.
3. Agregator HIR4You (ultima fază) — aici devin relevante toate, mai ales
   `ai-dispatch-match` (multi-vendor routing) și `ai-vendor-brand-copy`
   (onboarding rapid de vendori noi).

## Cum reactivezi una

1. `git mv supabase/_archive/<nume> supabase/functions/<nume>`
2. Setează flag-ul `HIR_FEATURE_<NUME>_ENABLED=true` + `ANTHROPIC_API_KEY` în
   Supabase (vezi comentariul din fiecare `index.ts` pentru numele exact).
3. Scrie implementarea reală (fiecare fișier are `TODO: real impl` exact unde
   trebuie completat).
4. Push pe `main` — `.github/workflows/deploy-edge-functions.yml` o
   redeployează automat.
