# HIR Master Blueprint — 2026-04-28

> Synthesizes everything we know after the demo: GloriaFood public research (PR #34, 95+ features cataloged), GloriaFood **firsthand-screenshot analysis** (PR #38 — surfaced the retirement bombshell below), Wolt/Glovo/Bolt courier UX research (PR #26), 5 vertical templates (PR #28), Wolt-tier courier app UX (PR #32), 5 storefront sales features (PR #31), AI CEO admin scaffold (PR #35), security + a11y fixes (PRs #21/27/29/30/33), and the owner's strategic positioning (memory: `strategic_vision_courier_fleet_aggregator.md` + `gloriafood_retiring_april_2027.md`).

> Owner: Iulian Moldoveanu. Period: 12 weeks from 2026-04-28.

## ⚠️ THE BOMBSHELL — read this first

**GloriaFood (owned by Oracle Hospitality) is officially retired on April 30, 2027.** A red banner appears on every screen of their partner + restaurant dashboards stating this. ~12 months from today.

**Every restaurant currently on GloriaFood — thousands in Romania alone, hundreds of thousands globally — is a forced migrator within 12 months.**

This single discovery overrides every other prioritization in this document:

- **Tier-1 P0 #1 = "Migrate from GloriaFood in 5 minutes" importer.** Ship in <8 weeks.
- **Sales narrative for 2026-2027 = retirement-driven migration.** Lead with this in every conversation with any known GloriaFood user.
- **Reseller program acquires 10× more leverage** during this window — Iulian's reseller network has warm leads with people who literally need to leave GloriaFood.
- **The 12-month migration window closes ~March 2027.** Build for that runway.

This is the most important paragraph in this document. Everything below assumes we ship the migration importer and lead with the retirement narrative.

---

## 1. The Vision in One Page

HIR is a **software-mediated aggregator** over Romania's existing courier capacity. We don't own riders. We don't build POS hardware. We don't compete on feature breadth.

We win by being the **AI CEO** any restaurant or pharmacy in Romania needs to digitize their operations in 30 minutes — and that runs autonomously while the patron drinks coffee.

**Three revenue streams**:
1. **SaaS** — recurring per merchant per month (Plus 49€, Pro 149€, hard-capped Free)
2. **Brokerage margin** — small fee per delivery routed to subcontracted fleets (Wolt/Glovo/Foody/FoodPanda)
3. **Reseller program** — 20% commission + custom markup. Hire salespeople. Iulian already does this with GloriaFood; we mirror their model with HIR-AI on top.

**Strategic moats** (in order of strength):
1. **AI CEO orchestration layer** — GloriaFood has 100 buttons; HIR has 5 buttons + a Telegram chat that does the rest
2. **UX simplification** — a 50-year-old non-technical patron must run HIR end-to-end from a phone
3. **Fleet relationships** — Iulian personally knows fleet managers at Wolt/Glovo/Foody. National coverage = phone call away.
4. **Multi-tenant + multi-vertical** — one product, many verticals (italian/asian/fine/bistro/romanian + future)
5. **Reseller distribution** — exponential salesforce without exponential payroll

---

## 2. Architecture — One Codebase, Three Surfaces

```
hir-platform/
├── apps/restaurant-web/        ← what customers see (storefront, /track, /m/[slug])
├── apps/restaurant-admin/      ← what owner sees (dashboard, AI CEO)
├── apps/restaurant-courier/    ← what couriers see (PWA, multi-fleet white-label)
├── apps/copilot/               ← Telegram bot edge functions (Asistent, Tenant Learner)
└── packages/
    ├── delivery-client/        ← typed SDK: storefront → courier API
    ├── integration-core/       ← POS adapters (Mock, future Freya/iiko/etc)
    ├── restaurant-templates/   ← 5 verticals data-only (PR #28)
    ├── supabase-types/         ← shared DB types
    └── ui/                     ← shadcn-based component library
```

**Single Supabase project** (qfmeojeipncuxeltnvab). **Single auth tenancy.** **Three deploys** on Vercel (web/admin/courier). Migrations bundled.

---

## 3. The 4-Layer Product Model

```
┌─────────────────────────────────────────────────┐
│ Layer 4 — AI CEO ORCHESTRATION                  │
│   Daily brief, 1-tap approvals, auto-content    │
│   Asistent agent (Telegram), Tenant Learner     │
├─────────────────────────────────────────────────┤
│ Layer 3 — MARKETING & GROWTH                    │
│   Newsletter, lifecycle, promos, reviews        │
│   Heatmap, social proof, reorder rail           │
├─────────────────────────────────────────────────┤
│ Layer 2 — OPERATIONAL CORE                      │
│   Orders, menu, dispatch, payments, kitchen     │
│   Multi-fleet courier dispatch, photo proof     │
├─────────────────────────────────────────────────┤
│ Layer 1 — TENANT, AUTH, BRANDING                │
│   Multi-tenant, RLS, custom domains, templates  │
│   Reseller program (partners + commissions)     │
└─────────────────────────────────────────────────┘
```

**The genius**: Layer 4 SUBSUMES interactions GloriaFood requires you to click through Layers 1-3 manually. Operator never sees the complexity.

---

## 4. The Phased Roadmap (12 weeks)

### Faza 0 — STABILIZE (now → +2 weeks)

| Action | Owner |
|---|---|
| Vercel Pro propagates → batch-merge 14 open PRs in priority order | Iulian + me |
| Apply migrations 003 (photo proof), 004 (templates), 005 (newsletter), 006 (item fields) | me via Supabase API |
| Smoke test end-to-end: storefront → admin → courier → Telegram | me |
| Fix anything Codex flagged on the merged PRs | me |
| Domain pointing to hiraisolutions.ro fully verified | Iulian |

### Faza 1 — DIFFERENTIATE (+2 → +6 weeks)

The features that make a signup say "I can't go back to GloriaFood":

| # | Feature | Why | Effort |
|---|---|---|---|
| 1 | **Onboarding wizard** with template picker (uses PR #28) | 15-min signup → live storefront. Beats GloriaFood by 20× on time-to-value. | M |
| 2 | **AI CEO daily brief on Telegram** — 3 suggestions/day, 1-tap approve | THE moat. Operator gets a CEO, not 100 buttons. | M |
| 3 | **"Migrate from GloriaFood" wizard** — paste API key, 5-min import | Inbound funnel — direct steal from GloriaFood. | L (~6 wk) |
| 4 | **Driving-distance delivery fee** (not just zone-polygon) | Fixes #1 GloriaFood reviewer complaint. Sales talking point. | S |
| 5 | **Heatmap of out-of-zone orders** | Datele le avem deja. 30 sec → know where to expand. | S |
| 6 | **Free tier hard-capped HIR** — 1 location, 100 orders/mo, footer "powered by HIR" | Stops bleeding to GloriaFood Free. | M |
| 7 | **Reservations widget** with optional deposits | GloriaFood standard. Customers ask for this. | M |

### Faza 2 — MATCH PARITY + DISTRIBUTE (+6 → +12 weeks)

| # | Feature | Why |
|---|---|---|
| 8 | **Autopilot lifecycle** (cart abandon, second-order, win-back, birthday) | AI CEO drafts → operator approves → execution automated |
| 9 | **Allergen tags + per-size pricing + modifier min/max** | Schema work; deblochează lossless GloriaFood import |
| 10 | **Reseller program backend** (`partners` + `partner_referrals` + `partner_commissions`) | Iulian's scaling lever |
| 11 | **Multi-language polish** RO/EN across all surfaces | Already wired in storefront; expand to admin + courier |
| 12 | **Photo proof + offline IndexedDB queue** for courier | PR #26 Wolt-pattern recommendation — P0 for OTC pharma later |

### Faza 3 — DEEPEN MOAT (3 → 6 months)

| # | Feature |
|---|---|
| 13 | **Native mobile apps** (iOS+Android via Capacitor) — for both customers and operators |
| 14 | **Multi-location chain support** — central settings, per-location overrides |
| 15 | **Smart Marketing AI v2** — auto-generate Instagram/Facebook posts via Canva API |
| 16 | **Predictive analytics** — "AI predicts 8 deliveries Friday 19:00; recommended courier shift schedule" |
| 17 | **Voice commands** for Telegram bot (RO STT) |
| 18 | **Branded customer mobile app** ($59/mo upsell — matches GloriaFood Pro tier) |

---

## 5. The AI CEO Master Plan

The AI CEO is THE differentiator. Not as a chatbot — as a **subsuming layer** over every other layer.

### Daily Loop

```
06:00 UTC  Tenant Learner agent updates `copilot_tenant_facts`
           (sales by hour, top items, trending complaints, recurring patterns)
           ↓
08:00 UTC  Asistent generates 3 daily suggestions; posts to Telegram thread
           ↓
Owner reads on Telegram (or admin /dashboard/ai-ceo/ if at desk):
   - 👍 → Asistent executes (sends emails, marks sold-out, posts on socials)
   - 👎 → logged as feedback; Asistent learns
```

### Example suggestions

```
🍕 "Comanda Margherita scade 30% azi vs ieri.
    Vrei să trimit promo emerald 15% la 50 emails activi?"
    → 👍 / 👎

📧 "Ai 3 clienți care nu au mai comandat de 21+ zile.
    Vrei email win-back cu cod 10%?"
    → 👍 / 👎

🛑 "Stoc 'Sezon limitat' la trufele Penne Boletus.
    Marchez sold-out la ora 21:00 azi?"
    → 👍 / 👎
```

### Self-improving moat

Tenant Learner runs weekly; Asistent's suggestions get more accurate as it learns each restaurant's unique patterns. **After 30 days, the AI CEO is personalized to YOUR restaurant** — a moat that strengthens over time. Replicating it requires not just code but accumulated data per tenant.

### Visible surface

- **Telegram thread** (primary — operator's phone)
- **`/dashboard/ai-ceo/`** in admin (PR #35 already shipped this) — recent runs, facts learned, pending suggestions

---

## 6. The Reseller Program (Iulian's Scaling Lever)

Schema (Faza 2):

```sql
CREATE TABLE partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  commission_pct NUMERIC(5,2) NOT NULL DEFAULT 20,
  custom_markup_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'BRONZE'
       CHECK (tier IN ('BRONZE','SILVER','GOLD')),
  invite_code TEXT UNIQUE NOT NULL,
  iban TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE partner_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES partners(id),
  tenant_id UUID REFERENCES tenants(id) UNIQUE,
  referred_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE partner_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES partners(id),
  tenant_id UUID REFERENCES tenants(id),
  period_yyyymm TEXT NOT NULL,
  base_amount_ron NUMERIC(10,2) NOT NULL,
  commission_amount_ron NUMERIC(10,2) NOT NULL,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tier structure (suggested)

| Tier | Commission | Markup allowed | Threshold |
|---|---|---|---|
| **Bronze** | 20% | 0% | Default for any new partner |
| **Silver** | 15% | up to 30% over base | After 5 active referrals |
| **Gold** | 10% | up to 50% over base | After 20 active referrals + IRL meeting with HIR |

(Bronze = pure direct sales. Silver/Gold = "agency" types who want to private-label HIR locally.)

### Partner Dashboard

`apps/restaurant-admin/src/app/partner/` (gated by partner role):
- Referrals list (clients I've signed up + their MRR)
- Commissions this month (breakdown per client)
- Payout history
- Settings (commission %, custom markup, IBAN)
- Invite link generator (`https://app.hir.ro/signup?ref=<invite_code>`)

### Onboarding via Reseller

1. Partner generates invite link with their `invite_code`
2. New restaurant clicks → sees **"Recommended by [Partner Name]"** + welcome offer
3. After signup: `partner_referrals` row created, commission tracked from first paid month

---

## 7. The "Move from GloriaFood in 5 minutes" Playbook

Use their public Smart Ordering API (documented at `GlobalFood/integration_docs` on GitHub).

### User flow

1. New tenant signs up at `/onboarding` with email + restaurant name
2. After signup: dropdown "Where do you currently order from?" → `GloriaFood / Bolt Food / Glovo / None`
3. If "GloriaFood": page asks for their per-restaurant API key (link to instructions to find it)
4. We call `GET https://pos.globalfoodsoft.com/pos/menu` with the key
5. Map their categories → ours, items → ours, sizes → per-size pricing, modifiers → modifiers, allergens → tags
6. **Preview screen**: "We imported X categories, Y items. Review and edit:" with side-by-side
7. One-click confirm: tenant ready, AI CEO greets them on Telegram

### Marketing

- Landing page: `hiraisolutions.ro/migrate-from-gloriafood` with the 5-min countdown video
- Sales pitch: *"Folosești GloriaFood? Mută-te în 5 min, fără să atingi tastatura. Plus, primești AI CEO care îți face postări Instagram automat."*

### Effort estimate

~6 weeks 1 dev. **Faza 1 priority — biggest inbound funnel of 2026.**

---

## 8. UX Simplification Principles (MANDATORY)

These are litmus tests. If a PR breaks one, push back.

1. **One primary action per screen.** Max 2 secondary. If you're adding a 3rd, the AI CEO should be doing it.
2. **Phone-first.** Always design mobile FIRST, desktop LATER.
3. **Patron-first, dev-last.** A 50-year-old non-technical patron must use it without help.
4. **No nested tabs.** Max 1 level of grouping. If you need 6 tabs, the page is wrong.
5. **No empty states without a primary CTA.** Every empty state shows: "Adaugă primul item" / "Pornește prima campanie" / etc.
6. **Loading is invisible if < 200ms.** Otherwise, skeletons.
7. **Errors speak human.** Not "INTERNAL_SERVER_ERROR_500" but *"Ne-am lovit de o problemă. Reîncearcă într-o secundă sau scrie-ne."*
8. **Approve > Configure.** AI CEO drafts the action; operator approves with one tap.
9. **Don't replicate GloriaFood UX failures.** The forced-volume order alarm, 14-field promo creator, 6-tab menu builder — market AGAINST these.

---

## 9. Pricing Strategy

### Free (HIR-branded, hard-capped)
- 1 location, max 100 orders/month
- HIR storefront brand color (purple), HIR footer "powered by HIR"
- AI CEO disabled (only daily digest, no auto-execute)
- **Why**: stops the bleeding to GloriaFood Free, captures bottom-funnel

### Plus — 49 EUR/month
- 1 location, unlimited orders
- Custom domain + custom branding (no HIR footer)
- AI CEO enabled (with operator approval flow)
- Newsletter (1000 contacts)
- Email support

### Pro — 149 EUR/month
- Up to 5 locations
- Branded mobile app (iOS+Android, our managed submission)
- AI CEO with auto-execute mode (some actions don't require approval)
- Newsletter (10000 contacts) + lifecycle automation
- Phone + Telegram support

### Custom (reseller-only)
- Reseller sets the price (markup over Pro base)
- For chains, agencies, white-labelers
- Negotiated per-deal

---

## 10. Distribution Plan

### Direct sales by Iulian (now → month 3)
- Brașov + București restaurants, target: 10 paying clients
- Pitch: "0% comision Glovo, brand-ul tău, AI CEO. 49-149 EUR/lună."

### Reseller program (after Faza 2)
- Hire 3-5 salespeople in Cluj, Iași, Timișoara, Constanța, Sibiu
- Bronze tier default; escalate based on performance
- Target: 50 paying clients distributed by month 6

### "Migrate from GloriaFood" inbound (after Faza 1)
- SEO landing + Google Ads on "GloriaFood alternativă"
- Target: 20% of new signups by month 6 from this channel

---

## 11. The 30-Day "Wow" Journey

What surprises a new HIR customer on:

### Day 1 (signup)
- Picks Italian template → storefront looks like a polished food brand in 60 seconds
- AI CEO greets on Telegram: *"Bună! Sunt Asistentul tău. În 5 minute învăț despre restaurantul tău. Ce specialitate vrei să afișez prima pe meniu?"*

### Day 3
- AI CEO: *"Am observat că vânzările tale de pizza scad la 14:00. Vrei să afișez 'Lunch deal: 2 pizze + băutură = 45 RON' între 11:00-15:00? Va fi salvat ca promoție recurentă."*

### Day 7
- AI CEO digest: *"Săptămâna asta: 47 comenzi, 1842 RON. Top vândut: Margherita. Mulți comandă seara 19:00-21:00. Recomand să afișezi un teaser de cină din ora 17:00."*

### Day 14
- Customer abandoned cart cu Carbonara → AI CEO: *"Vrei să-i trimit lui Andrei cod 10% recovery?"* Owner aprobă → email pleacă.

### Day 30
- Monthly digest: *"Februarie: 380 comenzi (+18% vs ianuarie). AI CEO a salvat 12 comenzi prin recovery. ROI: AI CEO a generat 1240 RON revenue în plus față de cei 49 EUR plătiți."*
- Reseller pitch: *"Cunoști un alt restaurant care ar folosi HIR? Recomandă-l, primești 20% comision pe primul lor an."*

---

## 12. What We DON'T Build

| Avoided | Why |
|---|---|
| Own courier fleet (employed riders) | Opposite of strategy. Operations stay with subcontracted fleets. |
| Proprietary POS hardware | We're POS-agnostic — adapter pattern (PR #25) covers it. |
| Receipt printer drivers | Partner with Star/Epson SDK if asked. Not core. |
| Volume-order alarm | GloriaFood's UX failure — market AGAINST it. |
| Forced cookie wall on storefront | Pulls conversion down 30%. |
| More than 5 verticals | Until first paying customer asks for vertical 6. |
| Feature-by-feature parity with GloriaFood | We win on simplicity + AI, not feature count. |

---

## 13. Risks + Mitigations

| Risk | Mitigation |
|---|---|
| GloriaFood retaliates with feature dump or price cut | AI CEO + UX simplicity moat hard to copy in <12 months |
| Wolt/Glovo block our brokerage flows | Diversify across 4 fleets (Wolt, Glovo, Foody, FoodPanda) — not dependent on any single one |
| Iulian's bandwidth (single founder) | Reseller program = scaling lever; AI agents = effective multi-developer effort |
| Slow Romanian market adoption | Free tier as hook; Faza 1 = simple onboarding; AI CEO daily wow-moments |
| Vercel/Supabase price scaling | Pro plans (paid) handle 10× current load; sweat-test at 100+ tenants |
| Codex review backlog grows | Each PR auto-runs Codex review on open; we triage & fix as part of QA |
| Trade-secret claims if migration importer touches private GloriaFood APIs | Use ONLY their public Smart Ordering API (GitHub-published spec) |

---

## 14. Metrics That Matter

Single dashboard, weekly review:

- **Active tenants** (signed up + ≥1 order this week)
- **GMV** (sum of `total_ron` across orders this week)
- **AI CEO approval rate** (suggestions accepted / total)
- **Reseller-driven signups** (after Faza 2)
- **Migration-from-GloriaFood signups** (after Faza 1)
- **Monthly Recurring Revenue** (Plus + Pro tier subscriptions)
- **Web Vitals** (LCP, INP for storefront mobile p90, from Vercel Speed Insights)
- **Net Promoter Score** (after Faza 1, monthly survey to active operators)

If any flatlines for 4 weeks → diagnose + fix.

---

## 15. Closing

HIR is not building "an ordering system + delivery app". We're building:

> **the simplest, smartest restaurant operating system in Romania** — orchestrated by AI, distributed via fleet aggregation + reseller network, migrating customers off GloriaFood with zero friction.

**The next 12 weeks ship Faza 0-2.** The next 12 months ship Faza 3 + scale via resellers. The next 24 months: HIR is the default for any small/mid Romanian restaurant or pharmacy that wants out of the 25-30% commission trap.

This document is a working artifact. Update it weekly as Faza 0 ships and reality teaches us what's right.

— Iulian + Claude, 2026-04-28
