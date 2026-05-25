-- Wave 2 — Audit log for Hepi Curier AI persona.
--
-- Stores every Hepi Curier interaction: prompt, response, model, token usage.
-- Per-courier RLS — each courier reads only their own runs.

create table if not exists public.courier_agent_runs (
  id            uuid primary key default gen_random_uuid(),
  courier_id    uuid not null references auth.users(id) on delete cascade,
  agent_name    text not null default 'hepi-curier',
  prompt        text not null,
  response      text,
  model         text,
  prompt_tokens int,
  response_tokens int,
  error         text,
  created_at    timestamptz not null default now()
);

create index if not exists ix_courier_agent_runs_courier_created
  on public.courier_agent_runs(courier_id, created_at desc);

alter table public.courier_agent_runs enable row level security;

drop policy if exists "courier_agent_runs_self_select" on public.courier_agent_runs;
create policy "courier_agent_runs_self_select" on public.courier_agent_runs
  for select using (courier_id = auth.uid());

-- INSERT happens via service role from /api/courier/hepi only; no public
-- write policy.

comment on table public.courier_agent_runs is
  'Wave 2 — audit log of every Hepi Curier interaction. Stores prompt + '
  'response + token counts per courier. RLS-scoped: each courier reads '
  'only their own runs. Inserts via service role from /api/courier/hepi.';
