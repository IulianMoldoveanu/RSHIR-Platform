-- Voice AI handler — add VOICE to the order_source enum so orders
-- created from phone-call transcripts can be distinguished in reports
-- and on the dashboard.
--
-- Idempotent: ALTER TYPE ... ADD VALUE IF NOT EXISTS.
-- Must run AFTER 20260606_007_order_source_aggregator_values.sql.

alter type public.order_source add value if not exists 'VOICE';
