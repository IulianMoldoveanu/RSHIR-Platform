-- Backfill went_live_at for tenants that already have went_live=true but
-- never stored a timestamp. We use updated_at as the best available proxy.
-- Idempotent: the WHERE clause restricts to rows missing went_live_at.
update tenants
  set settings = jsonb_set(
    settings,
    '{onboarding,went_live_at}',
    to_jsonb(coalesce(settings->'onboarding'->>'went_live_at', updated_at::text))
  )
  where settings->'onboarding'->>'went_live' = 'true'
    and (settings->'onboarding'->>'went_live_at') is null;
