-- HIR Restaurant Suite - RSHIR-27 GDPR redaction support.
-- Adds an audit timestamp on customers and a helper function that performs
-- a GDPR right-to-erasure redaction in one transaction:
--   * customers.first_name / last_name -> 'redacted'
--   * customers.email / phone -> null
--   * customers.deleted_at -> now()
--   * customer_addresses for the customer: line1/line2 redacted, lat/lng nulled,
--     city + postal_code preserved for tax reporting.
--
-- The function is SECURITY DEFINER so route handlers using the anon role are
-- never used to call it directly; only the service-role client should invoke
-- it. Idempotent.

alter table public.customers
  add column if not exists deleted_at timestamptz;

create or replace function public.gdpr_redact_customer(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.customers
     set first_name = 'redacted',
         last_name  = 'redacted',
         email      = null,
         phone      = null,
         deleted_at = coalesce(deleted_at, now())
   where id = p_customer_id;

  update public.customer_addresses
     set line1     = 'redacted',
         line2     = null,
         latitude  = null,
         longitude = null,
         label     = null
   where customer_id = p_customer_id;
end;
$$;

revoke all on function public.gdpr_redact_customer(uuid) from public;
revoke all on function public.gdpr_redact_customer(uuid) from anon, authenticated;
grant execute on function public.gdpr_redact_customer(uuid) to service_role;
