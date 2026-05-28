-- Migration: marketing_calculator_leads table
-- Stores leads captured from /calculator-roi interactive tool.
-- No RLS needed — insert-only via service role in API route.

CREATE TABLE IF NOT EXISTS public.marketing_calculator_leads (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone                          text NOT NULL,
  restaurant_name                text,
  city                           text,
  comenzi_per_zi                 int,
  aov_lei                        int,
  estimated_savings_monthly_lei  int,
  created_at                     timestamptz DEFAULT now()
);

COMMENT ON TABLE public.marketing_calculator_leads IS
  'Leads captured from /calculator-roi interactive ROI tool. Insert-only via service role.';
