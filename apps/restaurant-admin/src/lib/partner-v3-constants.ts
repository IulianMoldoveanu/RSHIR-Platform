// Partner v3 — canonical reward constants. Single source for Tracks B/C/D/E/F.
// Spec: apps/restaurant-admin/src/lib/partner-v3-spec.md
// Memory: decision_reseller_v3_snowball_2026-05-16.md

export const V3_CONSTANTS = {
  // Layer 2 — sponsor override on HIR-net of sub-reseller's restaurants
  OVERRIDE_PCT_Y1: 10.0,
  OVERRIDE_PCT_RECURRING: 6.0,
  OVERRIDE_CAP_OF_DIRECT_PCT: 40.0,
  SUNSET_MONTHS: 24,

  // Deal registration (Section §4 of v3 memo)
  DEAL_LOCK_DAYS: 30,
  DEAL_LOCK_EXT_DAYS: 30,

  // Layer 7 — restaurant→restaurant Champion loop
  CHAMPION_CASH_CENTS: 10000, // €100
  CHAMPION_FREE_MONTHS: 1,
  CHAMPION_TRIAL_EXT_DAYS: 30, // 30 + 30 default = 60d total trial

  // Layer 1b — first-5-quick-win + speed-to-live
  QUICK_WIN_CENTS: 10000, // €100 per restaurant closed <14d from partner signup
  SPEED_CENTS: 5000, // €50 per restaurant LIVE in <14d
  QUICK_WIN_CAP_PER_PARTNER: 5, // first 5 only

  // Layer 4 — activity bonuses
  STREAK_CENTS: 10000, // €100/month at 3+ rest brought
  STREAK_MIN_REST: 3,
  QUALITY_CENTS: 15000, // €150/month, all rest in 6mo avg >100 ord/zi
  QUALITY_MIN_ORDERS_PER_DAY: 100,

  // Layer 2b + Layer 5 — team building
  MENTOR_BRONZE_CENTS: 20000, // €200 per sub crossing 5 rest (one-shot per sub)
  TEAM_BUILDER_CENTS: 50000, // €500/month at 15+ team rest brought
  TEAM_BUILDER_MIN_TEAM_REST: 15,
  MENTOR_MONTH_CENTS: 100000, // €1,000 mentor-of-month
  QUARTER_STREAK_CENTS: 150000, // €1,500 quarterly milestone

  // Misc
  TESTIMONIAL_CENTS: 10000, // €100 one-shot opt-in
} as const;

export type WaveLabel = 'W0' | 'W1' | 'W2' | 'W3' | 'OPEN';

export const WAVE_BONUSES: Record<
  WaveLabel,
  {
    slot_cap: number; // -1 = unlimited
    direct_y1: number;
    direct_recurring: number;
    override_y1: number;
    override_recurring: number;
    description: string;
  }
> = {
  W0: {
    slot_cap: 5,
    direct_y1: 5.0,
    direct_recurring: 5.0,
    override_y1: 0,
    override_recurring: 0,
    description: 'Pilot Founders — +5%/+5% direct FOR LIFE.',
  },
  W1: {
    slot_cap: 15,
    direct_y1: 3.0,
    direct_recurring: 3.0,
    override_y1: 0,
    override_recurring: 0,
    description: 'Early Founders — +3%/+3% direct FOR LIFE.',
  },
  W2: {
    slot_cap: 50,
    direct_y1: 0,
    direct_recurring: 0,
    override_y1: 2.0,
    override_recurring: 2.0,
    description: 'Core Wave — +2%/+2% override boost FOR LIFE.',
  },
  W3: {
    slot_cap: 200,
    direct_y1: 0,
    direct_recurring: 0,
    override_y1: 0,
    override_recurring: 0,
    description: 'Scale Wave — eligible Mentor-of-month.',
  },
  OPEN: {
    slot_cap: -1,
    direct_y1: 0,
    direct_recurring: 0,
    override_y1: 0,
    override_recurring: 0,
    description: 'Open enrollment — standard comp.',
  },
};

export type LadderTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';

export const LADDER_TIERS: Record<
  LadderTier,
  { restaurants: number; cents: number; rank: number; perks: string }
> = {
  BRONZE: {
    restaurants: 5,
    cents: 35000,
    rank: 1,
    perks: 'Tricou + featuring leaderboard',
  },
  SILVER: {
    restaurants: 15,
    cents: 100000,
    rank: 2,
    perks: 'Diplomă + invitație Forumul Reseller-ilor',
  },
  GOLD: {
    restaurants: 30,
    cents: 300000,
    rank: 3,
    perks: 'Diplomă + ceremonie regională + iPhone',
  },
  PLATINUM: {
    restaurants: 50,
    cents: 700000,
    rank: 4,
    perks: 'Ceremonie publică + advisory call lunar Iulian',
  },
  DIAMOND: {
    restaurants: 100,
    cents: 2000000,
    rank: 5,
    perks: '1% equity vesting 4y cliff 1 + press release + board observer invite',
  },
};
