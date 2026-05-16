# Partner v3 — implementation spec for downstream agents

Reference: `Desktop\HIR-Status-Reports\RSHIR\RSHIR-RESELLER-PROGRAM-V3-SNOWBALL-STRATEGY.md`
Memory: `decision_reseller_v3_snowball_2026-05-16.md`

This doc is the **canonical contract** for v3 tables/functions. All downstream
agent work (commission engine, bonus engine, partner-portal UI, champion +
powered-by-HIR, public leaderboard + admin) must conform to this spec.

---

## Tables shipped in PR `feat/v3-reseller-schema`

### `partner_sponsors`
2-tier override relationships. One sponsor per sub-reseller (unique sub_partner_id).
- `override_pct_y1` default 10.00, recurring default 6.00
- `sunset_at` default now() + 24mo
- `total_paid_cents` cumulative audit

### `reseller_leads`
Deal registration with 30-day exclusivity lock.
- `contact_hash` — `sha256(lower(coalesce(phone,'')||'|'||coalesce(email,'')||'|'||coalesce(cui,'')))`
- Partial unique on `contact_hash WHERE status='active'` — only one active lock at a time
- `unlocks_at` = `locked_at + 30 days`
- One extension of 30 more days allowed (set `extended=true`)
- Function `public.reseller_leads_expire_stale()` flips active→expired past unlock

### `champion_referrals`
Restaurant → restaurant viral loop. Unique referred_tenant_id.
- Reward state machine: `pending → trial_active → verified → paid` (or `void`)
- `free_months_credited` int, `cash_bonus_cents` bigint, `trial_extended_days` int (default 30 = 60-day trial total)

### `partner_waves` (alter partners + wave_bonuses table)
- `partners.wave_label` — text, one of `W0|W1|W2|W3|OPEN` (default OPEN)
- `partners.wave_joined_at` — timestamptz
- `wave_bonuses` table — canonical config seeded with W0..OPEN rows:
  - W0: +5% Y1 / +5% recurring direct **FOR LIFE** (5 slots)
  - W1: +3% / +3% direct **FOR LIFE** (15 slots)
  - W2: +2% / +2% override boost **FOR LIFE** (50 slots)
  - W3: 200 slots, no comm bonus, eligible Mentor-of-month
  - OPEN: unlimited, standard comp

### `ladder_milestones` + `ladder_tiers`
- `ladder_tiers` seeded:
  - BRONZE 5 rest → €350 (35000 cents)
  - SILVER 15 → €1,000 (100000)
  - GOLD 30 → €3,000 (300000)
  - PLATINUM 50 → €7,000 (700000)
  - DIAMOND 100 → €20,000 (2000000) + 1% equity
- `ladder_milestones` — actual award events, unique per (partner_id, tier_reached)

### `partner_activity_bonuses`
Recurring + event-driven bonuses. Types:
- `STREAK` €100 (monthly, 3+ rest brought)
- `QUALITY` €150 (monthly, all rest in last 6mo >100 ord/zi avg)
- `SPEED` €50 (event, restaurant LIVE in <14d)
- `MENTOR_BRONZE` €200 (event, sub-reseller crosses 5 rest)
- `QUICK_WIN` €100 (event, restaurant closed in <14d of reseller signup)
- `TEAM_BUILDER` €500 (monthly, team brings ≥15 rest)
- `MENTOR_MONTH` €1,000 (monthly winner)
- `QUARTER_STREAK` €1,500 (quarterly milestone)
- `TESTIMONIAL` €100 (one-shot opt-in)

Recurring types (STREAK/QUALITY/TEAM_BUILDER/MENTOR_MONTH/QUARTER_STREAK) are
unique per (partner_id, bonus_type, period_start) — idempotent on re-run.

### `partner_commissions` extensions
Existing v2 columns preserved. New:
- `commission_type` — `DIRECT|OVERRIDE|CHAMPION_GIFT|WAVE_BONUS`
- `source_partner_id` — for OVERRIDE rows, the sub partner
- `pct_applied` — exact % (audit)

### `partners` KYC extensions
- `iban`, `cnp_hash`, `cui`, `address`
- `kyc_status` — `UNVERIFIED|PENDING_REVIEW|VERIFIED|REJECTED` (default UNVERIFIED)
- `kyc_verified_at`, `kyc_notes`
- `public_testimonial_optin` boolean (default false)

### `tenants` Champion extensions
- `champion_code` — unique referral code (8-char base32 from id; lazy-generated)
- `powered_by_hir_badge` — boolean, default `true` (opt-out, not opt-in)

---

## Edge function contracts (Tracks B, C, E)

### `partner-commission-calc` v3 (Track B)
Extends existing. For each `partner_referrals` row in period:
1. Compute DIRECT commission as v2 (no change to existing logic).
2. Apply Wave permanent bonus: lookup `partners.wave_label` → join `wave_bonuses` →
   add `direct_pct_y1_bonus` if within Y1, else `direct_pct_recurring_bonus`.
   Write extra row `commission_type='WAVE_BONUS'`.
3. If partner has sponsor (`partner_sponsors.sub_partner_id`), AND
   `sunset_at > period_end`, AND aggregate override caps not exceeded:
   - Compute override = HIR_NET × override_pct (Y1 or recurring).
   - For Wave 2 sponsors, add `wave_bonuses.override_pct_y1_bonus` / `_recurring_bonus`.
   - Write `commission_type='OVERRIDE'`, `source_partner_id=<sub>`.
4. If referral_id has a `champion_referrals` row where referrer_tenant's reseller
   = current partner, write `commission_type='CHAMPION_GIFT'` mirroring the DIRECT amount
   for the referred tenant (the "gift" — original reseller gets full Y1 comm).

Override cap rule: total OVERRIDE rows in period × ≤ 40% of total DIRECT rows in period.
If would exceed, scale down OVERRIDE rows proportionally.

### `champion-referral-credit` (Track E, NEW)
Trigger: when a new `tenants` row is inserted with `champion_referred_by_code` set.
1. Resolve `champion_code` → referrer_tenant_id.
2. Insert `champion_referrals` row (status=`pending`, trial_extended_days=30 = 60d total trial).
3. After 30 days of new tenant existence + first paid month verified, flip status to `verified`.
4. Apply rewards: 1 month free credit to referrer + cash_bonus_cents=10000 (€100).

### `bonus-monthly-calc-v3` (Track C, NEW)
Cron monthly on day 2 (after partner-commission-calc on day 2 at 03:00).
For each ACTIVE partner:
1. Count rest brought in `period` (refer to `partner_referrals.referred_at`).
2. If ≥3, write STREAK bonus.
3. Compute avg ord/zi in last 6mo → if all rest >100 → QUALITY bonus.
4. Check each `partner_referrals` row referred_at ↔ first order ≤14d → SPEED €50 + QUICK_WIN €100.
5. For each sponsor: count subs that crossed 5 rest in period → MENTOR_BRONZE €200 each.
6. Compute team total for sponsor (sum of subs' rest brought) → ≥15 → TEAM_BUILDER €500.
7. Quarterly check (March/June/Sept/Dec): 3 consecutive months with ≥3 rest → QUARTER_STREAK €1,500.
8. Ladder check: for each active partner, count `partner_referrals` (ended_at IS NULL),
   if ≥ next threshold in `ladder_tiers` and no row in `ladder_milestones` yet → insert.

Idempotency: recurring bonuses use the (partner, type, period_start) partial unique;
ladder_milestones uses (partner, tier_reached) unique. Re-running is safe.

---

## UI contracts (Tracks D + E + F)

### Partner portal (`/partner-portal/*` — Track D)
- `/team` — list of sub-resellers (where current partner = sponsor), aggregate stats per sub,
  invite-link generator
- `/leads` — deal registration form, list of own active locks, expired locks history,
  status of pitched leads
- `/calculator` — input: monthly restaurants you plan to bring, sub-resellers count;
  output: estimated direct comm + override + ladder progress
- `/ladder` — visual ladder Bronze→Diamond with current progress
- `/library` — sales kit links (PDF deck, WhatsApp templates, email templates, video pitches)

### Restaurant admin (`/dashboard/champion` — Track E)
- Show `champion_code` (lazy-generated on first visit)
- Show share buttons (WhatsApp, Email, copy-link)
- List own referred restaurants + reward status
- Toggle for `powered_by_hir_badge` opt-out

### Public (`/parteneriat/*` — Track F)
- `/parteneriat/leaderboard` — anonymized top 10 reselleri (display name only, public_testimonial_optin)
- `/parteneriat/calculator` — public-facing calculator (same as portal version, no auth)
- `/parteneriat` redesign — surface the 9 hooks + waves

### Admin (`/dashboard/admin/partners/[id]/v3` — Track F)
- Wave assignment (W0/W1/W2/W3/OPEN)
- KYC review (UNVERIFIED → PENDING_REVIEW → VERIFIED)
- Sponsor assignment (manual override)
- Ladder award trigger (manual one-shot)

---

## Hashing helpers (Tracks B + D + E)

### Contact hash (deal registration)
```ts
import { createHash } from 'crypto';
export function contactHash(phone?: string|null, email?: string|null, cui?: string|null) {
  const norm = (s?: string|null) =>
    (s ?? '').trim().toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9@.+]/g, '');
  const joined = `${norm(phone)}|${norm(email)}|${norm(cui)}`;
  return createHash('sha256').update(joined).digest('hex');
}
```

### Champion code (lazy generation)
```ts
export function championCode(tenantId: string): string {
  // First 8 chars of base32-encoded sha256 of tenant id, uppercase
  const h = createHash('sha256').update(tenantId).digest();
  return Buffer.from(h).toString('base64').replace(/[+/=]/g, '').slice(0, 8).toUpperCase();
}
```

### CNP hash
```ts
export function cnpHash(cnp: string): string {
  const digits = cnp.replace(/\D/g, '');
  if (digits.length !== 13) throw new Error('CNP must be 13 digits');
  return createHash('sha256').update(digits).digest('hex');
}
```

---

## Reward calculation constants (single source)

```ts
export const V3_CONSTANTS = {
  OVERRIDE_PCT_Y1: 10.00,
  OVERRIDE_PCT_RECURRING: 6.00,
  OVERRIDE_CAP_OF_DIRECT_PCT: 40.00,
  SUNSET_MONTHS: 24,
  DEAL_LOCK_DAYS: 30,
  DEAL_LOCK_EXT_DAYS: 30,
  CHAMPION_CASH_CENTS: 10000,           // €100
  CHAMPION_FREE_MONTHS: 1,
  CHAMPION_TRIAL_EXT_DAYS: 30,          // → 60d total trial
  QUICK_WIN_CENTS: 10000,               // €100 per <14d close
  SPEED_CENTS: 5000,                    // €50 per <14d live
  STREAK_CENTS: 10000,                  // €100/month at 3+ rest
  QUALITY_CENTS: 15000,                 // €150/month
  MENTOR_BRONZE_CENTS: 20000,           // €200 per sub crossing 5
  TEAM_BUILDER_CENTS: 50000,            // €500/month at 15+ team rest
  MENTOR_MONTH_CENTS: 100000,           // €1,000 mentor-of-month
  QUARTER_STREAK_CENTS: 150000,         // €1,500 quarterly milestone
  TESTIMONIAL_CENTS: 10000,             // €100 one-shot opt-in
  WAVE_BONUSES: {
    W0: { direct_y1: 5.00, direct_rec: 5.00, override_y1: 0, override_rec: 0 },
    W1: { direct_y1: 3.00, direct_rec: 3.00, override_y1: 0, override_rec: 0 },
    W2: { direct_y1: 0, direct_rec: 0, override_y1: 2.00, override_rec: 2.00 },
    W3: { direct_y1: 0, direct_rec: 0, override_y1: 0, override_rec: 0 },
    OPEN: { direct_y1: 0, direct_rec: 0, override_y1: 0, override_rec: 0 },
  },
  LADDER_THRESHOLDS: {
    BRONZE: { rest: 5, cents: 35000 },
    SILVER: { rest: 15, cents: 100000 },
    GOLD: { rest: 30, cents: 300000 },
    PLATINUM: { rest: 50, cents: 700000 },
    DIAMOND: { rest: 100, cents: 2000000 }, // + 1% equity (manual offer)
  },
} as const;
```

Place this constant in `apps/restaurant-admin/src/lib/partner-v3-constants.ts`
on first usage (PRs B/C will land it).

---

## Cross-PR dependencies

```
A (schema) ─┬─→ B (commission engine v3)
            ├─→ C (bonus engine v3)
            ├─→ D (partner-portal UI v3)
            ├─→ E (Champion + Powered-by-HIR)
            └─→ F (Public leaderboard + admin)
```

B and C share the constants file. Whoever lands first creates it. The other PR
imports from it. Same for `partner-v3-helpers.ts` (hashing).

Once all 5 land, smoke test the full flow:
1. Create test partner (W0 Founder, KYC verified)
2. Register a lead → close → tenant created
3. Verify DIRECT + WAVE_BONUS commission rows next cycle
4. Add sub-reseller → bring 5 rest → MENTOR_BRONZE + override rows + ladder Bronze
5. Champion: tenant A refers tenant B → reward state machine → CHAMPION_GIFT row to A's reseller
