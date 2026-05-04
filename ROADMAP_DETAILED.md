# RSHIR — Detailed Roadmap to 100% (multi-city + pharma-integrated)

**Sealed**: 2026-05-04 BEAST night.
**Owner**: Iulian Moldoveanu — `iulianm698@gmail.com`.
**Strategy version**: v2 (frequent-PR + autonomous additive-schema + pharma promoted).

---

## Strategy v2 — what changed and why

### Change 1 — Higher PR throughput, smaller surface area
**Old**: Lanes batch work, ship a few large PRs, schema PRs queue indefinitely.
**New**:
- One feature / one fix = **one PR**, max ~200 LOC.
- Auto-merge on green CI for non-schema changes (already in effect).
- Schema PRs no longer block in batches — instead **daily review window 21:00 EET**: Iulian skims accumulated schema PRs in 1 sitting.

**Why**: codex-review-poll cron now reviews PRs in <3 min. Drift-sweep tool catches missed migrations. The system can absorb 20+ PRs/day cleanly if each is small.

### Change 2 — Chief autonomy on **additive-only** schema
**Old**: every schema change required Iulian sign-off, even pure `CREATE TABLE IF NOT EXISTS` additions.
**New (proposed for explicit OK)**:
- **Additive-only** migrations (CREATE TABLE / ADD COLUMN / CREATE INDEX, all idempotent guards) → Chief auto-applies via Mgmt API after PR merge, runs `scripts/post-merge/run-all-pending.mjs --apply`.
- **Mutative** migrations (DROP / RENAME / TYPE-NARROW / column with NOT NULL retroactive) → still hold for sign-off, daily review window.
- **Destructive** ops on real data (DELETE FROM, TRUNCATE) → forever sign-off.

**Why**: bottleneck tonight wasn't engineering, it was you not being woken up to approve each `create table if not exists`. Drift-sweep + audit_log + git history give us a full reverse trail; if anything goes wrong, we know what + when in <30 sec.

**Iulian: confirm or push back. If you confirm, I update memory + lane prompts.**

### Change 3 — Pharma integration promoted from T+30 to T+5
**Old**: pharma was a separate domain, integration deferred ≥1 month per `courier_strategy.md`.
**New**: courier app must be integrated with pharma BEFORE traffic ramps. Plan in W3.

**Why**: your message — "să evităm eventuale riscuri mai târziu când vor fi din ce în ce mai mulți vizitatori." Once 20+ tenants are live, retrofitting pharma into the courier dispatch loop becomes a risky migration. Doing it now, with 1 anchor tenant, is cheap.

---

## Concrete weekly plan

### Week 0 — Tonight (now → T+12h)

**Goal**: Demo-ready FOISORUL A, all 5 BEAST lanes landed.

| # | Action | Owner | Success criterion |
|---|---|---|---|
| 0.1 | Iulian seeded as auth + admin + fleet owner | Chief | ✅ DONE |
| 0.2 | `customer_push_subscriptions` migration | Chief | ✅ DONE |
| 0.3 | Vercel `HIR_PLATFORM_ADMIN_EMAILS` set | Chief | ✅ DONE |
| 0.4 | Roadmap committed | Chief | ✅ DONE (#196) |
| 0.5 | Lane A: real order on FOISORUL A E2E | Sub-agent | Order ID in DB + admin sees + email sent |
| 0.6 | Lane B: self-service onboarding wizard | Sub-agent | Test tenant created in <10 min via UI only |
| 0.7 | Lane C: multi-fleet courier audit + fix | Sub-agent | 1 rider serves 2+ tenants without 5xx |
| 0.8 | Lane D: security audit (OWASP top-10) | Sub-agent | 0 P1, ≤2 P2 unfixed |
| 0.9 | Lane E: acquisition funnel polish | Sub-agent | `/affiliate?ref=iulian` → DB row → approve → partner code in 5 clicks |

### Week 1 — Tomorrow (T+12h → T+36h)

**Goal**: 1+ Brașov restaurant onboarded LIVE in front of patron. Iulian DMs 3 contacts before driving to Bucharest.

| # | Action | Owner | Success criterion |
|---|---|---|---|
| 1.1 | Iulian smoke: login admin → see /fleet → place real order on FOISORUL A | Iulian | All 3 in <10 min |
| 1.2 | Onboard Brașov restaurant #2 via Lane B wizard | Iulian + Chief on standby | Tenant live with menu in <10 min |
| 1.3 | Iulian DMs 3 fleet manager contacts: "salut, vrei să devii partener? <URL>" | Iulian | 1+ application by tonight |
| 1.4 | Approve first partner application | Iulian | 1+ row in `partners` with tier=AFFILIATE |
| 1.5 | Stripe sandbox setup → first test charge end-to-end | Chief (PR) | 1 test charge in Stripe dashboard |
| 1.6 | Sentry alert thresholds reviewed (currently noisy or silent?) | Chief | Threshold doc in repo |

### Week 2 — Bucharest trip (T+36h → T+5d)

**Goal**: 3+ fleet manager partners signed. 2+ Bucharest restaurants in pipeline. Multi-fleet model proven on real data.

| # | Action | Owner | Success criterion |
|---|---|---|---|
| 2.1 | 3 in-person demos with fleet managers | Iulian | 3+ self-applies via `?ref=iulian-buc-<date>` |
| 2.2 | Provision 1 new fleet for first signed partner | Chief (Lane C deliverable in production) | Partner sees `/fleet` empty dashboard |
| 2.3 | Onboard 2 Bucharest restaurants referred by signed partners | Iulian + Chief | 2 tenants live with custom domain |
| 2.4 | Multi-fleet smoke: 2 fleets, 2+ riders each, 4+ restaurants distributed | Chief (PR) | Dispatch board shows correct cross-fleet aggregation |
| 2.5 | Courier app multi-tenant hardening (push notifs per tenant brand) | Chief (PR) | Test push from 2 tenants, both arrive correctly tagged |

### Week 3 — Pharma integration ⚠️ promoted (T+5d → T+10d)

**Goal**: pharma orders flow through restaurant-courier riders end-to-end. Pharma cutover `db push → migrate deploy` paired with this for one risky window.

| # | Action | Owner | Success criterion |
|---|---|---|---|
| 3.1 | RSHIR consumer-side Edge Function `pharma-courier-intake` | Chief (PR + sign-off, additive schema for `pharma_courier_links` if needed) | Function ACTIVE, smokes 200 with valid HMAC |
| 3.2 | Pharma backend producer side (HMAC sign + idempotency) | pharma-coordinator (separate session) | Test order POSTed end-to-end |
| 3.3 | Pharma `prisma db push → migrate deploy` cutover | pharma-coordinator + Iulian sign-off | All 8 migration dirs marked applied; `db push` flag removed from `railway.json` |
| 3.4 | E2E test: pharma POSTs a test order → courier rider sees it tagged "Farmacie" → delivers → status callback to pharma | Chief + pharma-coordinator | Order completes; pharma side shows DELIVERED |
| 3.5 | Audit log integration: pharma's append-only audit gets a copy of courier events | Chief (PR) | 1 row in pharma audit per courier transition |

### Week 4 — Payments + commissions (T+10d → T+20d)

**Goal**: Stripe live, processing real money. Commission cycle calculated automatically.

| # | Action | Owner | Success criterion |
|---|---|---|---|
| 4.1 | Stripe webhook listener fully wired (refunds, disputes, payment_intent.succeeded) | Chief (PR) | Webhook smoke clean |
| 4.2 | Partner commission cron pre-flight test (manual run on test data) | Chief (PR) | `partner_commissions` rows for May 2026 with correct amounts |
| 4.3 | Payouts UI in admin (`/dashboard/admin/partners/payouts`) | Chief (PR series) | Iulian can see + mark PAID |
| 4.4 | First real payout to first signed partner | Iulian | Bank transfer + `partner_commissions.status='PAID'` |

### Week 5-8 — Multi-city scale (T+20d → T+60d)

**Goal**: 50+ tenants, 10+ fleet manager partners, native app shells.

| # | Action | Owner |
|---|---|---|
| 5.1 | Native shell wrap (Capacitor or Expo) for courier-PWA → app store ready | Chief (PR series) |
| 5.2 | Performance pass: storefront < 200KB JS, server response < 500ms p95 | Chief (PR series) |
| 5.3 | Sentry + Grafana dashboards live for ops | Chief (PR series) |
| 5.4 | Self-service partner portal (right now reviewer is only Iulian) | Chief (PR) |
| 5.5 | A/B pricing test (3 RON flat vs Stripe-tiered) | Chief + Iulian |
| 5.6 | GloriaFood EOL migration script (one-click for clients with >1000 orders/mo) | Chief (PR) |

### Week 9-12 — Productization (T+60d → T+90d)

| # | Action | Owner |
|---|---|---|
| 6.1 | Sales sheet PDF + landing page polished | Chief + Iulian |
| 6.2 | Reseller training materials (PDF + video) | Iulian |
| 6.3 | Case-study page from FOISORUL A + 2 Bucharest tenants | Chief (PR) |
| 6.4 | Public pricing page | Chief (PR) |

### Week 13+ — 100% definition

**RSHIR is "100%" when:**
- ✅ 50+ tenants live across ≥3 cities
- ✅ 10+ fleet manager partners active
- ✅ Pharma integrated (1+ pharma order/day routed via restaurant-courier rider)
- ✅ Native app shells in App Store + Play Store
- ✅ Self-service onboarding completes 90% of new tenants without Iulian touching DB
- ✅ GloriaFood EOL migration script tested with 1+ real client (>1000 orders)
- ✅ 14 consecutive days Sentry-clean (no P1/P2 errors)
- ✅ Stripe processing >5,000 RON/day in commissions
- ✅ Audit log integrity verified weekly via cron
- ✅ Pharma + restaurant courier unified shipped (per memory `courier_strategy.md`, evaluation deferred ≥1 month)

---

## Per-component target progression

| Component | Now | W1 | W2 | W4 | W8 | W12 |
|---|---|---|---|---|---|---|
| Storefront | 90 | 95 | 96 | 97 | 99 | 100 |
| Admin tenant | 90 | 92 | 94 | 96 | 98 | 100 |
| Courier rider | 95 | 96 | 97 | 98 | 99 | 100 |
| Fleet Manager | 85 | 90 | 95 | 96 | 98 | 100 |
| Reseller | 80 | 85 | 92 | 95 | 98 | 100 |
| Affiliate | 75 | 85 | 92 | 95 | 98 | 100 |
| Onboarding | 70 | 90 | 95 | 96 | 99 | 100 |
| Plăți | 70 | 75 | 80 | 95 | 98 | 100 |
| Multi-fleet | 65 | 80 | 95 | 96 | 99 | 100 |
| Pharma integration | 0 | 0 | 30 | 80 | 95 | 100 |
| Security | 80 | 92 | 95 | 96 | 98 | 100 |
| DevOps | 95 | 96 | 97 | 98 | 99 | 100 |
| **Average** | **80** | **88** | **93** | **96** | **98** | **100** |

---

## PR cadence target

| Week | PRs/day target | Per-PR LOC budget | Schema-PR rate |
|---|---|---|---|
| W0 | 5-10 (BEAST) | <300 | Auto-apply additive |
| W1 | 5 | <200 | Daily review |
| W2 | 8 (Bucharest demos drive fixes) | <200 | Daily review |
| W3 | 6 (pharma integration heavy) | <250 | Both sides reviewed together |
| W4-8 | 4 | <150 | Daily batch |
| W9-12 | 3 | <150 | Weekly batch |

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Pharma `db push --accept-data-loss` corrupts data when columns change | 🔴 High | W3 cutover to `migrate deploy` paired with integration |
| Multi-fleet cross-tenant order leak | 🔴 High | Lane C audit + integration tests |
| Stripe webhook desync with `audit_log` | 🟡 Medium | W4 webhook dedup + replay protection |
| Single-fleet failure mode = total dispatch outage | 🟡 Medium | W2 multi-fleet redundancy |
| Self-service onboarding allows squatter slugs | 🟡 Medium | W1 Lane B email-domain verification |
| Affiliate spam apply | 🟢 Low | Honeypot + rate limit shipped (#191) |

---

## How Iulian and I sync

- **Daily 21:00 EET review window** — schema PRs, Sentry digest, lane reports.
- **Real-time blockers** — Telegram via Hepi bot.
- **Weekly retro** — Sundays, what shipped + what's next week's lanes.
- **Trip days** — Iulian on the ground, Chief drives lanes async; Iulian only intervenes for sign-offs.

---

## What I need from Iulian RIGHT NOW

1. **Confirm Strategy v2 — change 2** (Chief auto-applies additive-only schema). One word: ✅ sau ❌.
2. **Confirm pharma promotion** to W3. One word: ✅ sau ❌.
3. **Confirm Stripe sandbox credentials** are in vault (`stripe.test.secret_key`) so I can wire W1 step 1.5.

Once those 3 are confirmed, the lanes can run truly autonomously through Bucharest trip without waking you up.

---

**Updated**: 2026-05-04 23:50 (BEAST sprint v2).
**Living document** — Chief updates weekly. Schema lanes update inline.
