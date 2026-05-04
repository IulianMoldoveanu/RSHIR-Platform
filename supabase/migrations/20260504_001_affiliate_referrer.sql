-- Lane E acquisition funnel — capture `?ref=<name>` query-string attribution
-- on the /affiliate apply page. Iulian DMs links like /affiliate?ref=iulian
-- to fleet managers in Bucharest; we record which DM channel produced an
-- application so the team can rank the productive DM lists later.
--
-- Additive only: nullable text column, capped to 64 chars at the API layer
-- (no DB constraint to keep migration trivially reversible).

alter table public.affiliate_applications
  add column if not exists referrer text;

create index if not exists affiliate_applications_referrer_idx
  on public.affiliate_applications (referrer)
  where referrer is not null;

comment on column public.affiliate_applications.referrer is
  'Free-text attribution slug captured from ?ref=<x> on /affiliate. Useful for tracking which DM list / source produced the application. Not a foreign key.';
