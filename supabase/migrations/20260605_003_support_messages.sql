-- Lane U — In-app customer support chat panel
-- Additive: new public.support_messages table for storefront-side support
-- intake. Customer/storefront-facing only — distinct from feedback_reports
-- (admin-app feedback FAB → Triage/Fix/Supervisor pipeline).
--
-- Policy:
--   - Inserts go through /api/support/message (Next.js route, service-role
--     client). Anon role has NO insert/select policy here; the API route
--     bypasses RLS with service_role on the server.
--   - Platform admins read via the admin app /dashboard/admin/support page
--     using the same service-role client + HIR_PLATFORM_ADMIN_EMAILS gate.
--   - No tenant scoping at row level — message is platform support, not
--     per-tenant. tenant_id is captured for context only.

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  auth_user_id uuid references auth.users(id) on delete set null,
  email text,
  category text check (category in ('ORDER','PAYMENT','ACCOUNT','OTHER')),
  message text not null,
  ip text,
  user_agent text,
  status text not null default 'NEW' check (status in ('NEW','IN_PROGRESS','RESOLVED','SPAM')),
  admin_note text,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists support_messages_status_idx
  on public.support_messages (status);
create index if not exists support_messages_created_at_idx
  on public.support_messages (created_at desc);
create index if not exists support_messages_tenant_idx
  on public.support_messages (tenant_id)
  where tenant_id is not null;

alter table public.support_messages enable row level security;
-- no anon/authenticated policies = service-role only access
