-- Contact form: give the phone and the message columns of their own.
--
-- 2026-08-02 — /contact was returning `invalid_body` for any real message.
-- The form packed the phone and the whole message into `ref`, which the API
-- schema caps at 100 chars (`ref` maps to `ref_partner_code`, a partner code
-- column — not a free-text field). Anything past a one-line message failed
-- validation, so the form worked only for the shortest possible submissions
-- and silently rejected everything else.
--
-- Idempotent: safe to re-run, and safe to run before or after the code deploy
-- (the API writes these columns only when they exist in its own payload).

alter table public.migrate_leads
  add column if not exists phone text,
  add column if not exists message text;

comment on column public.migrate_leads.phone is
  'Optional contact phone from the /contact form. Free text — not validated as E.164.';
comment on column public.migrate_leads.message is
  'Free-text message from the /contact form. Previously crammed into ref_partner_code, which truncated at 100 chars and rejected the request.';
