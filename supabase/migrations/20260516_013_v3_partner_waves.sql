-- HIR Reseller v3 — partner waves (Founder cohort with permanent bonuses)
--
-- Replaces "200 reselleri Y1 cap" from v2 with progressive waves:
--   W0 (5 slots, T+0..T+30):  +5% Y1 / +5% recurring  FOR LIFE
--   W1 (15 slots, T+30..T+90): +3% Y1 / +3% recurring  FOR LIFE
--   W2 (50 slots, T+90..T+180): +2% override boost FOR LIFE (cumulative with Layer 2)
--   W3 (200 slots, T+180..T+365): eligible for Mentor-of-month, no comm boost
--   OPEN (unlimited, T+365+): standard comp, no permanent bonus
--
-- partners.wave_label is the assignment. wave_bonuses is the canonical
-- configuration table — commission engine reads from this when applying
-- the Wave permanent delta.

-- ============================================================
-- partners.wave_label + wave_joined_at — assignment columns
-- ============================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'partners' and column_name = 'wave_label'
  ) then
    alter table public.partners add column wave_label text not null default 'OPEN'
      check (wave_label in ('W0','W1','W2','W3','OPEN'));
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'partners' and column_name = 'wave_joined_at'
  ) then
    alter table public.partners add column wave_joined_at timestamptz;
  end if;
end$$;

create index if not exists partners_wave_label_idx
  on public.partners (wave_label) where wave_label <> 'OPEN';

comment on column public.partners.wave_label is
  'v3 Founder cohort assignment. W0=5 founders, W1=15 early, W2=50 core, W3=200 scale, OPEN=standard. Permanent bonuses per wave_bonuses table.';

-- ============================================================
-- wave_bonuses — canonical config (one row per wave label)
-- ============================================================
create table if not exists public.wave_bonuses (
  wave_label              text primary key
    check (wave_label in ('W0','W1','W2','W3','OPEN')),
  slot_cap                int not null check (slot_cap > 0 or slot_cap = -1),
  -- -1 = unlimited (OPEN wave)
  direct_pct_y1_bonus     numeric(5,2) not null default 0
    check (direct_pct_y1_bonus >= 0 and direct_pct_y1_bonus <= 20),
  direct_pct_recurring_bonus numeric(5,2) not null default 0
    check (direct_pct_recurring_bonus >= 0 and direct_pct_recurring_bonus <= 20),
  override_pct_y1_bonus   numeric(5,2) not null default 0
    check (override_pct_y1_bonus >= 0 and override_pct_y1_bonus <= 10),
  override_pct_recurring_bonus numeric(5,2) not null default 0
    check (override_pct_recurring_bonus >= 0 and override_pct_recurring_bonus <= 10),
  description             text,
  created_at              timestamptz not null default now()
);

insert into public.wave_bonuses (wave_label, slot_cap, direct_pct_y1_bonus, direct_pct_recurring_bonus, override_pct_y1_bonus, override_pct_recurring_bonus, description)
values
  ('W0', 5, 5.00, 5.00, 0.00, 0.00,
    'Pilot Founders — 5 slots, +5% direct Y1 + +5% direct recurring FOR LIFE. Wave 0 commits to weekly 1:1 + public testimonial opt-in.'),
  ('W1', 15, 3.00, 3.00, 0.00, 0.00,
    'Early Founders — 15 slots, +3% direct Y1 + +3% recurring FOR LIFE.'),
  ('W2', 50, 0.00, 0.00, 2.00, 2.00,
    'Core Wave — 50 slots, +2% override boost (Y1+recurring) FOR LIFE. Eligible Mentor-of-month.'),
  ('W3', 200, 0.00, 0.00, 0.00, 0.00,
    'Scale Wave — 200 slots, eligible Mentor-of-month. Standard comp.'),
  ('OPEN', -1, 0.00, 0.00, 0.00, 0.00,
    'Open enrollment — unlimited. Standard comp.')
on conflict (wave_label) do nothing;

comment on table public.wave_bonuses is
  'v3 — canonical Wave config. Commission engine joins partners.wave_label → this table to apply permanent bonus delta.';

alter table public.wave_bonuses enable row level security;
