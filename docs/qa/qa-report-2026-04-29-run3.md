# Nightly QA report — 2026-04-29 (run 3)

Starting commit · `5d7a7ae` (Merge PR #79 feat/ai-ceo-brief-schedule-edit)
Apps scanned · `@hir/restaurant-web`, `@hir/restaurant-admin`
Run window · 2026-04-29T13:30Z → 2026-04-29T13:55Z

---

## Summary

3 findings · 0 auto-fixed (§5) · 2 reported · 1 informational
Codex sweep: 1 fix / 0 reply / 0 skip / 0 deferred

---

## §5 auto-fixed

None. All actionable bugs from §4 exceeded the auto-fix cap or are schema-related (report only).

---

## §6 Codex sweep

Window `2026-04-28T00:44:14Z` → `2026-04-29T13:55Z` · PRs scanned: 3 (#57, #45, #44)

| PR | file:line | classification | action | link |
|---|---|---|---|---|
| #57 | `docs/qa/codex-sweep-state.json:2` | Functional bug — future watermark drops comments in 19-min gap | FIX | [66863fa](https://github.com/IulianMoldoveanu/RSHIR-Platform/commit/66863fa) |

Processed comment IDs this run: `3159362170`

---

## Report-only findings (prioritized)

### [P2] Newsletter popup — all strings hardcoded in Romanian

- **Where** · `apps/restaurant-web/src/components/storefront/newsletter-popup.tsx`
- **Symptom** · Component accepts only `{ brandColor }` — no `locale` prop. All copy (`'Comandă mai ieftin: -10% la prima comandă'`, `'Vreau codul de 10%'`, `'Am înțeles'`, etc.) is hardcoded Romanian. EN-locale visitors see RO copy.
- **Suggested fix** · Add `locale: Locale` prop, move 8 strings into `dictionaries.ts` under a new `newsletter.*` namespace (RO + EN), replace literals with `t(locale, 'newsletter.*')`, thread `locale` from storefront layout where the component is mounted.
- **Why not auto-fixed** · Requires adding locale prop + updating call sites — change touches >3 files and >50 lines (exceeds §5 cap).

### [P2] Duplicate migration prefix `20260506_001_*` (carry-over)

- **Where** · `supabase/migrations/20260506_001_copilot_daily_brief_schema.sql` and `supabase/migrations/20260506_001_orders_payment_status_index.sql`
- **Symptom** · Two SQL files share the same timestamp prefix. `supabase migrate` applies them in filesystem sort order, which is non-deterministic across OS. If the orders index migration runs before the copilot schema and the copilot schema creates tables the index depends on, migrations could fail on a fresh DB.
- **Suggested fix** · Rename `20260506_001_orders_payment_status_index.sql` → `20260506_002_orders_payment_status_index.sql`.
- **Why not auto-fixed** · `supabase/migrations/**` is read-only per QA guardrails. Human must rename + verify.
- **Prior reports** · Also reported in run 2 (PR #57). Still unresolved.

---

## §7 Improvement suggestions

Non-bug. Human picks what to action.

### 1 · P0 — Drag-to-reorder menu items (carry-over)
- **Deferred item** · `docs/UI_UX_AUDIT_PROGRESS.md` §9 — "P0 drag-to-reorder".
- `sort_order` DB column + `reorderItemsAction` server action already exist in `apps/restaurant-admin/src/app/dashboard/menu/actions.ts`. Only the DnD wiring is missing (`@hello-pangea/dnd` or native HTML drag events on `items-panel.tsx`).
- Estimated effort: ~1 day. High operator impact — operators currently must use the order items arrive from the DB.

### 2 · P1 — Sound + tab title flash on new orders (carry-over)
- **Deferred item** · `docs/UI_UX_AUDIT_PROGRESS.md` §8 — "P1 sound + tab title flash".
- `orders-realtime.tsx` already subscribes to `restaurant_orders` inserts. Adding `document.title = '🔔 Comandă nouă!'` in the `onInsert` callback + a short `Audio` play is ~5 lines.
- Estimated effort: ~2 hours. High operator impact for busy restaurants where the admin tab runs in the background.

### 3 · P2 — Integration adapter registry has only `mock`
- `packages/integration-core/src/adapters/registry.ts` only registers `{ mock: mockAdapter }`. Any real tenant configured with `provider_key = 'POS_PUSH'` will hit `throw new Error("No integration adapter registered")` at webhook time, silently killing the dispatch.
- The `integration_events` viewer (PR #76) is now live, so operators _can_ see failures — but the root cause is the missing adapter. Before onboarding the first real POS tenant, at least a skeleton `POS_PUSH` adapter that logs + returns `{ ok: false }` should be registered so the error path is explicit rather than a thrown exception.

### 4 · P2 — `/rezervari` storefront fully hardcoded in Romanian (carry-over)
- Previously reported in run 2. Still 4 files, >50 lines. The `/rezervari/track/[token]` page (PR #72) and the decision emails (PR #71, #73) all use hardcoded RO copy.
- As reservations are used more, EN visitors will notice. Estimated: ~half day to thread `getLocale()` and extract strings.

### 5 · P2 — 17 API routes, 0 regression specs
- `apps/restaurant-web/src/app/api/` has 17 `route.ts` files. Only `checkout/intent/` has a `route.test.ts`.
- Highest risk routes without specs: `track/[token]/cancel`, `track/[token]/review`, `integrations/webhooks/[provider]/[tenant]`, `checkout/confirm`, `customer/data-delete`.
- These hit payment flows, customer data, and order state — regressions here have outsized customer impact.

### 6 · Modifier groups admin UI — appears to be addressed
- Prior runs flagged "modifier groups admin CRUD missing". `apps/restaurant-admin/src/app/dashboard/menu/modifiers-panel.tsx` exists and handles both grouped modifiers (`createModifierGroupAction`, `updateModifierGroupAction`, `deleteModifierGroupAction`) and legacy flat modifiers. The migration `20260505_001_modifier_groups.sql` shipped and the UI is present. No further action needed — this item can be closed in the audit doc.

---

## Run metadata

| Step | Result |
|---|---|
| `pnpm install --frozen-lockfile` | ✅ Done in 7.7s |
| `pnpm -r typecheck` | ✅ All 10 packages clean |
| `pnpm --filter @hir/restaurant-web build` | ✅ 17 routes built |
| `pnpm --filter @hir/restaurant-admin build` | ✅ All routes built |
| `pnpm -r lint` | ✅ Clean (1 non-fatal node module-type warning in packages/ui, not an error) |
| §4D sidebar link-walk | ✅ 19/19 routes resolve |
| §4E i18n drift | ✅ RO 269 / EN 266 (diff=3, within threshold) |
| §4G button type audit | ✅ All buttons have explicit `type=` |
| §4H defensive-SELECT | ✅ `payment_method` fallback in `track/[token]/route.ts`; `modifier_groups` in try/catch in `pricing.ts` |
| §4I CLS / aria audit | ✅ All images have width+height; all icon-only buttons have aria-label |
| §4J migration sequence | ⚠️ Duplicate prefix `20260506_001_*` (see P2 above) |
| §6 Codex sweep | 1 FIX on PR #57 (commit 66863fa), replied to comment `3159362170` |
