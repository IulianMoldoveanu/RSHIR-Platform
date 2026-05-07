-- Lane VOICE-CHANNEL-TWILIO-SKELETON — schema for the voice channel.
--
-- Sprint 12 skeleton. The full conversational flow (multi-turn dialog,
-- voice biometrics, multilingual TTS) is deferred to Sprint 14+. This
-- migration only adds the persistence layer the Twilio webhook + Whisper
-- transcription + Master Orchestrator dispatcher need to record what
-- happened on each incoming call.
--
-- One table: `voice_calls`. RLS = standard tenant scoping (tenant members
-- can read; writes go via service-role from the Edge Function).
--
-- Default off: a tenant only receives voice traffic after they paste
-- their Twilio phone number + auth token in `/dashboard/settings/voice`
-- and Twilio's voice webhook URL is set to point at our Edge Function.
--
-- Idempotent: re-runnable.

create table if not exists public.voice_calls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- Twilio's globally-unique call identifier (CA-prefixed). Unique so a
  -- replay of the same webhook does NOT create a second row.
  twilio_call_sid text not null,
  from_number text,
  to_number text,
  -- Whisper transcription of the caller's audio. Filled in after the
  -- recording is processed; null while the call is mid-flight.
  transcript text,
  -- Master Orchestrator intent name resolved from the transcript, e.g.
  -- 'cs.reservation_create'. Null when no intent matched.
  intent text,
  -- TTS-synthesized response that was played back to the caller. Stored
  -- verbatim so a later compliance review can reconstruct what the
  -- caller heard.
  response text,
  duration_seconds integer,
  status text not null default 'received'
    check (status in ('received', 'processed', 'failed')),
  -- Free-form metadata (Whisper API cost, dispatch result, error trace).
  metadata jsonb,
  created_at timestamptz not null default now(),
  unique (twilio_call_sid)
);

create index if not exists idx_voice_calls_tenant_created
  on public.voice_calls (tenant_id, created_at desc);

create index if not exists idx_voice_calls_status
  on public.voice_calls (status, created_at desc)
  where status = 'failed';

alter table public.voice_calls enable row level security;

-- Tenant members can read their own call log. Writes go through the
-- service-role client in the Edge Function — no authenticated write
-- policy by design.
drop policy if exists voice_calls_member_read on public.voice_calls;
create policy voice_calls_member_read
  on public.voice_calls
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members tm
       where tm.tenant_id = voice_calls.tenant_id
         and tm.user_id   = auth.uid()
    )
  );
