# HIR Courier — Support Bot Draft (NOT ACTIVATED)

> Status: **DRAFT — do not paste into production code yet.**
> Date locked: 2026-05-05.
> Activation trigger: when the platform has ≥3 fleet managers in production
> AND a support runbook exists per tenant.

## Why this is a draft

Per Iulian's product positioning (2026-05-05): the courier app is **NOT a Glovo
clone or aggregator**. It is **personal**: each tenant's dispatcher / owner is
directly responsible for their couriers. Therefore the "support bot" is NOT a
generic centralized helpdesk — it must:

1. Route by default to the courier's **own dispatcher / fleet manager / tenant
   owner**, not to "HIR support".
2. Have a fallback to HIR only when the courier is in Mode A and explicitly
   has no upstream contact configured.
3. Stay silent / hidden when not configured (no broken empty bot UI).

## Component spec (when activated)

### Placement
- Bottom-right floating button on every dashboard route (z-[55], below the
  shift-control overlay z-[60] and below modals).
- Icon: `MessageCircle` from lucide-react.
- 48×48 px tap target. Background: zinc-900 with violet-500 border.
- Badge dot when there's an unread reply.

### Behavior
- Tap → opens a small drawer (slide up from bottom) with three quick options:
  1. **"Sună dispecerul"** — `tel:` link to the configured fleet/tenant
     dispatcher phone (from `courier_profiles.dispatcher_phone` or fallback to
     `fleets.dispatcher_phone`).
  2. **"Trimite mesaj"** — opens an in-app thread keyed on
     `(courier_user_id, dispatcher_user_id, order_id?)`. Stored in
     `courier_support_threads` + `courier_support_messages` tables.
     Realtime via existing Socket pattern (or supabase realtime).
  3. **"Întrebări frecvente"** — static markdown rendered from
     `apps/restaurant-courier/src/content/courier-faq.md`. Topics: payments,
     shift schedule, photo proof, suspended account, app updates.

### Conditional visibility
- Mode A (single-tenant white-label): show. CTA opens chat with that tenant's
  dispatcher.
- Mode B (multi-tenant): show. CTA opens chat with the **assigned fleet's**
  fleet manager (resolved from `fleets.manager_user_id`). If no fleet
  assigned, hide the button.
- Mode C (fleet-managed): show. CTA opens chat with the fleet manager.

### What this is NOT
- NOT an LLM bot. The "bot" framing in the user request is shorthand for
  "support entry point" — the implementation is a **routed message + call
  panel**, not an autoresponder.
- NOT a global helpdesk. There is no "HIR support agent". Owners /
  dispatchers ARE the support layer.

## Files to add (when activating)

```
apps/restaurant-courier/src/components/support-bot.tsx          (new)
apps/restaurant-courier/src/components/support-thread-panel.tsx (new, child)
apps/restaurant-courier/src/content/courier-faq.md              (new)
apps/restaurant-courier/src/app/dashboard/api/support/messages/route.ts (POST + GET)
apps/restaurant-courier/src/app/dashboard/layout.tsx            (mount the bot)
supabase/migrations/2026XXXX_courier_support_threads.sql        (new)
```

## Migration draft

```sql
create table if not exists public.courier_support_threads (
  id              uuid primary key default gen_random_uuid(),
  courier_user_id uuid not null references auth.users(id) on delete cascade,
  dispatcher_user_id uuid references auth.users(id) on delete set null,
  order_id        uuid references public.courier_orders(id) on delete set null,
  status          text not null default 'OPEN' check (status in ('OPEN','RESOLVED','ARCHIVED')),
  last_message_at timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_courier_support_threads_courier
  on public.courier_support_threads (courier_user_id, last_message_at desc);

create table if not exists public.courier_support_messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.courier_support_threads(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  body        text not null check (length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);

create index if not exists idx_courier_support_messages_thread
  on public.courier_support_messages (thread_id, created_at);

-- RLS: courier sees their own threads; dispatcher sees threads where they're
-- the dispatcher_user_id; service-role bypass for fleet manager admin reads.
alter table public.courier_support_threads enable row level security;
alter table public.courier_support_messages enable row level security;

-- (Policies elided — to be drafted when activating.)
```

## Activation checklist (when ready)

- [ ] Stakeholder confirms ≥1 dispatcher per active tenant has a phone or
      Telegram contact configured.
- [ ] FAQ content reviewed by Iulian + a real fleet manager.
- [ ] Realtime channel for new messages tested end-to-end.
- [ ] Push notification path for unread message (reuse existing
      `/api/push/send` infrastructure).
- [ ] Apply migration via Supabase Mgmt API.
- [ ] Mount `<SupportBot />` in dashboard layout (after the bottom nav, z-55).
- [ ] Smoke: courier sends message → dispatcher sees badge → reply round-trip
      under 3s.
- [ ] Document in `RUNBOOK.md` how a tenant onboards their dispatcher's
      contact.

---

**Owner**: Iulian decides activation. Until then, do not import or render the
component anywhere.
