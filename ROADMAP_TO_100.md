# RSHIR — Roadmap to 100% (Multi-City Pilot)

**Sealed**: 2026-05-04 night, BEAST MODE sprint.
**Anchor event**: Iulian leaves for București in 2 days. Meets fleet managers + restaurant owners as future affiliates/resellers.
**North Star**: RSHIR ready to scale Brașov + București with self-service onboarding + multi-fleet courier model.

---

## Where we are right now (2026-05-04 23:30)

| Component | % | Status |
|---|---|---|
| Storefront client | 90% | All 3 apps on sha post-#195. FOISORUL A live with 158 menu items, 0 real orders yet. |
| Admin tenant panel | 90% | Cmd-K palette, AI CEO, branding, orders, menu, integrations, affiliates review (post #192). |
| Courier rider PWA | 95% | Map full-screen, shifts sync, slide-to-accept, multi-order assign. |
| Fleet Manager dashboard | 85% | Iulian seeded as owner of HIR Default Fleet. KPIs, live map, dispatch, history, earnings. |
| Reseller white-label | 80% | `partners.code/slug/landing_settings`, `/r/<code>` public landing, admin review. |
| Affiliate program | 75% | `affiliate_applications` + bounties. `/affiliate` public landing live, apply form working. |
| Self-service onboarding | 70% | GloriaFood Master Key import works, but no end-to-end wizard yet. **BEAST Lane B in progress.** |
| Plăți (Stripe + COD) | 70% | Idempotency-Key live. Zero real payments processed yet. |
| Multi-fleet support | 65% | Single fleet works, multi-fleet untested. **BEAST Lane C in progress.** |
| Security posture | 80% | Codex audit-bundle (#188) caught 4 real bugs. **BEAST Lane D in progress.** |
| DevOps + observability | 95% | Health monitor cron, codex-review-poll cron, drift-sweep tool, version routes. |
| Compliance + audit | 80% | audit_log live, 9 fleet actions wired. |

**Average**: ~82% for Brașov pilot, ~70% for true București scaling.

---

## BEAST MODE lanes (running tonight in parallel)

| Lane | Coordinator | Goal | Status |
|---|---|---|---|
| A — Demo readiness | rshir-coordinator (worktree `-laneA`) | Real-order E2E on FOISORUL A; fix any 5xx/UX inline | 🟢 running |
| B — Onboarding wizard | rshir-coordinator (worktree `-laneB`) | <10 min self-service tenant creation flow | 🟢 running |
| C — Multi-fleet + courier multi-use | rshir-coordinator (worktree `-laneC`) | 1 rider serving 2+ restaurants, fleet manager handling 3+ tenants | 🟢 running |
| D — Security audit | rshir-coordinator (worktree `-laneD`) | OWASP top-10 pass, fix P1+P2 inline | 🟢 running |
| E — Acquisition funnel | rshir-coordinator (worktree `-laneE`) | Single-URL self-apply funnel for Iulian's contacts | 🟢 running |

---

## T+0 → T+1 (tonight + tomorrow Brașov)

### Done tonight (Chief)
- ✅ Iulian seeded as `auth.users` + `platform_admins` OWNER + `HIR Default Fleet` owner
- ✅ `HIR_PLATFORM_ADMIN_EMAILS=iulianm698@gmail.com` set in Vercel admin → admin redeploy triggered
- ✅ `customer_push_subscriptions` migration applied (3-day drift closed)
- ✅ All 11 prior drifted migrations applied earlier this evening
- ✅ Drift-sweep tool live (PR #193) — anti-recidivă

### Tomorrow morning (Iulian)
1. Login at `https://hir-restaurant-admin.vercel.app/login` with `iulianm698@gmail.com` / `RSHIR1234`
2. Verify `/dashboard/admin/affiliates` returns 200 (not 403)
3. Visit `https://courier-beta-seven.vercel.app/fleet` — should show HIR Default Fleet KPIs
4. Place a real test order on `https://hir-restaurant-web.vercel.app/?tenant=foisorul-a` (Lane A may already validate this)
5. Onboard Brașov restaurant #2 via Lane B's wizard

### Tomorrow evening (Brașov)
- 1+ real Brașov restaurant onboarded
- 1+ real order completed end-to-end
- Lane A/B/C/D/E PRs all merged or queued for sign-off

---

## T+2 → T+7 (București trip)

### Day 1 in București
- 3+ fleet manager meetings → at least 2 self-apply via `/affiliate?ref=iulian-bucuresti`
- Demo `/fleet` dashboard live to each (use FOISORUL A as backdrop)
- Pitch: "vinde tu, eu încasez, 25% Y1 / 20% recurring"

### Day 2-3
- Approve their applications → they get partner codes
- 2+ Bucharest restaurants in pipeline (referred by the new resellers)
- Lane C deliverables (multi-fleet provisioning) tested with a real second fleet

### Day 4-7
- 5+ tenants live total across Brașov + București
- 2+ active fleet manager partners
- First commission cycle calculated (mocked or real)

---

## T+7 → T+30 (1 month)

### Operațional
- 20+ tenants
- 5+ fleet manager partners
- Stripe payments live, processing >100 RON/day in commissions
- Push notifications working post `customer_push_subscriptions` redeploy

### Tehnic
- Pharma cutover `prisma db push` → `migrate deploy` (Legea 95)
- Self-service partner portal (acum reviewer e doar Iulian)
- Multi-fleet provisioning UI when 2+ flote exist
- Sentry alert thresholds tuned per app
- E2E test suite in CI (currently only typecheck)

### Business
- GloriaFood EOL-ready migration script (clients with > 1000 orders/lună)
- Sales sheet pentru reseleri (PDF + landing)
- Pricing page A/B test (3 RON flat vs Stripe-style tiered)

---

## T+30 → T+90 (3 months, post-pilot scale)

- 50+ tenants
- 10+ fleet manager partners
- Pharma side scaled (Farmacia TEI as anchor)
- White-label app store presence (Apple/Google) for the courier PWA → wraps as native shells

---

## Hard constraints (forever)

- No schema/middleware/payments changes without explicit Iulian sign-off
- Always `git worktree add` per parallel session — no multi-tab chaos
- Always verify with `to_regclass` after schema merges (tool: `scripts/post-merge/run-all-pending.mjs`)
- Audit log integrity append-only — pharma compliance (Legea 95) bleeds into restaurant side once shared courier
- White-label only in Mode A (single restaurant + own fleet); Mode B/C use neutral theme
- "Fleet" terminology is INTERNAL ONLY — UI for merchants says "Dispecerat" or "Curieri"

---

## Decision tree for Iulian

| Situation | Action |
|---|---|
| Schema PR opens with additive-only migration | Sign off if tests green |
| Schema PR mutates / drops | Hold, ask for migration plan |
| Middleware change | Hold, audit who's affected |
| Payment-flow change | Hold, audit + manual smoke required |
| Stylistic / UX / docs PR | Auto-merge by Chief |
| Codex flags P1 in audit-bundle | Chief fixes inline |
| Drift-sweep finds new gap | Chief applies if additive, files PR if mutating |

---

## Telephone numbers (Bucharest contacts to reach during trip)

> Iulian: fill in here when stable. Format: `Name | Role | City | Status (lead / hot / signed)`

---

**Updated**: 2026-05-04 23:30 (BEAST sprint).
**Owner**: Iulian Moldoveanu — `iulianm698@gmail.com`.
**Chief**: Claude Opus 4.7 (1M context) running Chief role; spawned 5 rshir-coordinator agents for tonight's parallel execution.
