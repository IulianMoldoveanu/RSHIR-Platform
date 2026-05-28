# HIR Curier — Content Rating Questionnaire

Răspunsuri pentru chestionarul IARC (International Age Rating Coalition) din Google Play Console -> App content -> Content rating.

Expected outcome: **PEGI 3 / Everyone / USK 0**

---

## Step 1 — Category

**Question:** What kind of app is this?

**Answer:** **Reference, News, or Educational** -> **Business/Productivity**

(HIR Curier este o aplicație de business pentru curieri, NU un joc)

---

## Step 2 — Questionnaire

### Violence
| Question | Answer |
|---|---|
| Does the app contain violence? | **No** |
| Does the app contain realistic violence? | **No** |
| Does the app contain violence against vulnerable characters? | **No** |
| Does the app contain blood or gore? | **No** |

### Sexuality
| Question | Answer |
|---|---|
| Does the app contain sexual content, nudity, or sexual references? | **No** |
| Does the app contain sexually-suggestive themes or content? | **No** |

### Language
| Question | Answer |
|---|---|
| Does the app contain profanity or crude humor? | **No** |
| Does the app contain hate speech or discriminatory references? | **No** |

### Controlled substance
| Question | Answer |
|---|---|
| Does the app contain references to drugs, alcohol, or tobacco? | **No** |
| Does the app encourage or facilitate drug, alcohol, or tobacco use? | **No** |

### Gambling
| Question | Answer |
|---|---|
| Does the app contain simulated gambling? | **No** |
| Does the app contain real-money gambling? | **No** |

### User interaction
| Question | Answer |
|---|---|
| Does the app allow users to interact, exchange items, or share content? | **Yes (limited)** |
| Are user interactions moderated? | **Yes** (mesajele curier <-> client/dispecerat trec prin platforma HIR; nu există chat public sau UGC public) |
| Does the app share user location with other users? | **Yes** (locația curierului este partajată cu restaurantul/dispeceratul și opțional cu clientul activ — strict pe durata livrării) |
| Does the app allow users to purchase digital goods? | **No** |

### Misc
| Question | Answer |
|---|---|
| Does the app contain horror content? | **No** |
| Does the app contain content that could be unsettling for some users? | **No** |
| Does the app contain mature or suggestive themes? | **No** |
| Does the app promote or glorify any harmful activity? | **No** |

### Personal information
| Question | Answer |
|---|---|
| Does the app collect or share personal information? | **Yes** (vezi `data-safety-form.md` pentru detalii complete) |

---

## Expected ratings

Pe baza răspunsurilor de mai sus, ratings estimate:

| Region | Rating |
|---|---|
| ESRB (US/Canada) | **Everyone (E)** |
| PEGI (Europe) | **PEGI 3** |
| USK (Germany) | **USK 0** |
| ACB (Australia) | **G (General)** |
| GRAC (Korea) | **All** |
| ClassInd (Brazil) | **L (Livre)** |

---

## Target audience

În Play Console -> App content -> Target audience and content:

| Field | Answer |
|---|---|
| Target audience age range | **18+** (lucrătorii curieri sunt adulți; B2B context) |
| App appeals to children? | **No** |
| Do you have ads in your app? | **No** |
| Does your app contain news? | **No** |
| Does your app fall under Google Play's News policy? | **No** |

---

## Note pentru Iulian

- Toate răspunsurile sunt aliniate cu realitatea funcționalității app-ului (nu există conținut riscant)
- Singurele puncte „Yes": user interaction limitată (moderată prin platform) + sharing locație în context business + colectare PII
- Rating final ar trebui să fie **Everyone** în toate regiunile
- Dacă Play Console întreabă despre „User-generated content (UGC)": răspunde **No** — mesajele curier <-> client nu sunt UGC public, sunt comunicări tranzacționale 1:1 mediate de platform
