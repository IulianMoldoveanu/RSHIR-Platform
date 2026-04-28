# GloriaFood RO Leads — Prioritized Shortlist (2026-04-29)

Companion to `2026-04-29-gloriafood-ro-leads-prioritized.csv`. Source: `2026-04-29-gloriafood-ro-restaurants-leads.md` (36 leads, 18 cities). Enriched via WebFetch on homepage + `/contact` for leads missing phone/email; ~30 successful fetches before remote rate-limiting hit. 6 leads remain "needs manual enrichment".

## Top 10 P1 leads — call this week

1. **King Rolls** (București + Craiova, 3 locations) — fusion kebab chain, 3 location-specific emails (`vitan@`, `afi@`, `craiova@kingrolls.ro`), Bucharest mall presence (AFI Park) + Electroputere Mall Craiova. Highest-LTV account in batch.
2. **Pizzeria Allegria** (Bistrița + Năsăud, 2 locations) — clean phone+email enriched from `/contact`; pizza chain segment template fits.
3. **Time2Eat** (București + Ilfov, 3 zones: Mogoșoaia/Chiajna/Buftea) — `mivadelivery.ro`-style delivery-first model, 2 phone lines, exactly the dispatch ICP.
4. **Suzana Ribs & Wings** (București, Palatul Bragadiru) — premium venue, full contact (`reservation@suzanaribs.ro`), strong consumer brand.
5. **Restaurant COS / Clubul Oamenilor de Știință** (București Sector 1, Piața Lahovari) — Romanian Academy institutional client; 4 phones + 2 acad.ro emails. B2B angle distinct from rest of list.
6. **Pizza cu Gust Galați** (HQ for 5-domain chain) — single phone call to `+40 762 860 000` covers Galați + Tecuci + Bârlad + Buzău + Focșani sub-brands. Treat as P1 even though only Galați HQ has full contact.
7. **Cucina Di Casa** (București Tineretului, Calea Văcărești) — Italian, single phone enriched, established address.
8. **MIVA Pub & Lounge** (București Sector 6) — domain literally `mivadelivery.ro`, 2 phones, IG handle confirms delivery focus.
9. **Camizo** (București Sector 3) — landline number `+40 31 62 00 444` suggests established operation, not a pop-up.
10. **CRAFT Pub** (Craiova) — Tier-2 city, but has both `office@craftpub.ro` and phone — warm-email-then-call workflow lights up.

(Note: only 5 leads fully meet the strict P1 rubric of HIGH + email AND phone + multi-loc/major-city. The list above includes the next 5 that qualify under "Bucharest presence" liberally — same effective tier for outreach planning.)

## Per-city priority breakdown

| City | P1 | P2 | P3 | P4 | Total |
|---|---|---|---|---|---|
| București | 4 | 3 | 1 | 0 | 8 |
| Bistrița/Năsăud | 1 | 0 | 0 | 0 | 1 |
| Baia Mare | 0 | 0 | 1 | 1 | 2 |
| Constanța | 0 | 1 | 1 | 0 | 2 |
| Craiova | 0 | 1 | 0 | 0 | 1 |
| Galați | 0 | 1 | 0 | 0 | 1 |
| Tecuci | 0 | 1 | 0 | 0 | 1 |
| Bârlad | 0 | 1 | 0 | 0 | 1 |
| Buzău | 0 | 0 | 0 | 1 | 1 |
| Focșani | 0 | 0 | 0 | 1 | 1 |
| Tulcea | 0 | 1 | 0 | 0 | 1 |
| Pitești | 0 | 2 | 0 | 0 | 2 |
| 1 Decembrie (Ilfov) | 0 | 1 | 0 | 0 | 1 |
| Râmnicu Vâlcea | 0 | 1 | 0 | 0 | 1 |
| Râșnov | 0 | 1 | 0 | 0 | 1 |
| Sibiu | 0 | 1 | 0 | 0 | 1 |
| Suceava | 0 | 1 | 1 | 0 | 2 |
| Sântana de Mureș | 0 | 1 | 0 | 0 | 1 |
| Târgu Mureș | 0 | 2 | 0 | 0 | 2 |
| Motru | 0 | 0 | 1 | 0 | 1 |
| Unknown | 0 | 0 | 0 | 5 | 5 |
| **Total** | **5** | **18** | **5** | **8** | **36** |

## Reachable count

**P1 + P2 with phone present: 23 leads.** This is the "can call tomorrow" number. (All 5 P1 have phone; 18 of 18 P2 have phone — every P2 by construction includes phone or email, and in this batch all P2 entries except none have a phone.)

P1 + P2 with email present: 11 leads. Email-first sequence applies cleanly to these; the rest get phone-first.

## 3 quick observations

1. **Pizza is 1/3 of the dataset (12 of 36).** A pre-canned "Pizzerie + GloriaFood retirement" email + landing page would convert this slice fastest. The 5 Pizza cu Gust sub-domains alone are ~14% of the list and collapse to **one phone call** at HQ Galați (`+40 762 860 000`) — treat as a single sale, not five.
2. **București dominates: 8 leads, 4 of them P1.** Cluster outreach for a single Bucharest day-trip is realistic — King Rolls (Vitan/AFI), Cucina Di Casa (Tineretului), MIVA (Sector 6), Camizo (Sector 3), Suzana Ribs (Sector 5), COS (Sector 1) are all within 30 min drive of each other. In-person coffee meeting > cold call.
3. **6 leads (17%) had ECONNREFUSED on enrichment** (`cosmobm.ro`, `diamondclub.ro`, `hotelabi.ro`, `coco-delivery.ro`, plus the two Pizza cu Gust MED sub-domains). These sites are likely down or actively rejecting bot traffic — worth a manual eyeball before spending sales time. Could indicate the domain is dormant, in which case GloriaFood is already broken there and the urgency pitch is weaker.

## Enrichment notes & gaps

- **Verbatim-only emails:** no pattern-guessed addresses (`info@brand.ro`) were committed. 2 leads had emails behind JS-protection placeholders (`time2eat.ro`, others) — left blank.
- **Phone normalization:** all phones converted to `+40 XXX XXX XXXX` form where the input was unambiguous. Slash-separated multi-numbers preserved as-is.
- **No owner names surfaced** in any of ~30 fetches — Romanian restaurant sites generally don't expose owner identity in footer/contact. Will need LinkedIn or Facebook page sweeps for that.
- **Manual enrichment todo:** `cosmobm.ro`, `robaker.ro`, `diamondclub.ro`, `hotelabi.ro`, `coco-delivery.ro`, `xpburgers.ro` (xpburgers is LOW confidence anyway — likely abandoned).
