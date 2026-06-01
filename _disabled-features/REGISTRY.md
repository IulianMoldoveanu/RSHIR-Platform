# RSHIR — Disabled features registry

Folder pentru **funcționalități temporar dezactivate** care vor fi reluate în timp **mediu spre lung**. Aici se păstrează codul mutat din producție + motivul + criteriul de reactivare.

**IMPORTANT:** Acest folder NU se șterge. Codul rămâne în repo pentru:
1. Referință istorică (păstrăm muncă deja făcută)
2. Reactivare rapidă când contextul se schimbă
3. Audit (de ce a fost dezactivat?)

---

## Convenții

- Fiecare feature dezactivată trăiește în propriul sub-folder: `_disabled-features/<feature-slug>/`
- Sub-folderul conține: fișierele originale + un `README.md` cu detalii reactivare
- Fișierele NU se importă în prod (nu fac parte din build via `tsconfig` exclude sau prin lipsa import-urilor)
- Nu modifica codul aici fără a reactiva — dacă vrei reluare, mută înapoi la locul lui

---

## Features dezactivate

| # | Slug | Data dezactivare | Motiv | Criteriu reactivare |
|---|---|---|---|---|
| 1 | [`delivery-photo-proof/`](./delivery-photo-proof/README.md) | 2026-05-20 | "Fotografiile cu livrările vor fi dezactivate" — Iulian. Restaurant orders only; pharma (legal) păstrate | După 100+ orders/zi când proof e necesar pentru dispute |
| 2 | [`fiscal-export-ui/`](./fiscal-export-ui/README.md) | 2026-05-20 | "Fa sa nu fie vizibil exportul fiscal" — Iulian. Buton manual print bon-fiscal pe order detail | După SmartBill ISV + ANAF e-Factura per tenant (Q3 2026 sau 5+ tenants cer) |
| 3 | [`anpc-prominent-link/`](./anpc-prominent-link/README.md) | 2026-05-20 | "Contactul ANPC să nu mai fie așa de vizibil" — Iulian. Badge-uri 250×50 → text mic inline. Legal min păstrat | Doar dacă jurist Iulian determină că textul mic e insuficient |

---

## Cum reactivezi o feature

1. Citește `_disabled-features/<slug>/README.md`
2. Verifică criteriile de reactivare
3. Mută fișierele înapoi la locația originală (path indicat în README)
4. Restore import-urile (originale documentate în README)
5. Rulează `pnpm typecheck` + tests
6. Șterge entry-ul de aici și sub-folderul
7. PR titlu: `feat(reenable): <feature-name> — <reason>`

---

## Cum dezactivezi o feature nouă

1. Creează `_disabled-features/<slug>/`
2. Mută fișierele cu structura originală păstrată în sub-folder (mirror tree, e.g. `_disabled-features/foo/apps/restaurant-courier/src/components/foo.tsx`)
3. Scrie `README.md` cu:
   - **Original locations** (paths exacte)
   - **Removed imports** (call sites care au fost modificate)
   - **Reason for disabling** (de ce)
   - **Reactivation criteria** (când reluăm)
   - **Owner** (cine decis)
   - **Estimate** (când probabil reluăm — sau "TBD")
4. Adaugă rând în tabelul de mai sus
5. Commit + PR

---

## Notă legală

Pentru features dezactivate cu implicații legale (ex: ANPC, GDPR, contestare comenzi):
- Consultă juristul (soția Iulian) ÎNAINTE de a dezactiva
- Documentează raționamentul legal în README
- Adaugă reminder cron / alert pentru re-verificare anuală

---

## Index relativ

```
_disabled-features/
├── REGISTRY.md                    ← acest fișier
├── delivery-photo-proof/
│   ├── README.md
│   ├── apps/restaurant-courier/src/components/photo-proof-upload.tsx
│   └── (alte fișiere mutate)
├── fiscal-export-ui/
│   ├── README.md
│   └── (componente UI mutate)
└── anpc-prominent-link/
    ├── README.md
    └── (UI changes documentate)
```

---

*Ultima actualizare: 2026-05-20 — creare inițială + 3 features dezactivate (delivery-photo-proof, fiscal-export-ui, anpc-prominent-link)*
