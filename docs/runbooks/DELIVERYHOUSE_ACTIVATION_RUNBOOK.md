# Deliveryhouse / WordPress-WooCommerce Activation Runbook

How to put a **headless (HIR Connect)** tenant live — a patron who keeps
their own WordPress / WooCommerce storefront and uses HIR only for
last-mile delivery, AI cross-sell, and tracking. Built for the first pilot
at **deliveryhouse.ro** (5-restaurant Brașov chain, WordPress + optional
WooCommerce).

This is the activation counterpart to the WordPress plugin docs at
`integrations/wordpress/hir-connect/README.md`. Read that for the plugin
internals; read this to drive an end-to-end go-live.

> **Model.** The patron's site stays the storefront. New orders are
> **pushed** from the site to HIR (`POST /api/public/v1/orders`). HIR
> dispatches a courier and **pushes status back** to the site
> (`order.status_changed` webhook → `/wp-json/hir-connect/v1/webhook`).
> No WooCommerce REST *pull* is involved — that is a separate adapter used
> by the pharma vendor stack, not the deliveryhouse pilot.

---

## 0. Prerequisites

- Tenant row exists and is `ACTIVE` (create via `/dashboard/admin/onboard`).
- Patron site is WordPress 6.x, optionally with WooCommerce. Elementor Pro
  forms also work (no WooCommerce required).
- Operator has platform-admin access to `admin.hirforyou.ro`.
- A delivery zone covering the patron's city exists, and the city is
  `is_active` (see `/admin/cities`). Without an active zone HIR cannot
  price or dispatch the order.

---

## 1. Choose the activation path

There are two equivalent ways to switch a tenant into headless mode and
mint the credentials the plugin needs. Pick one.

### Path A — operator-driven (recommended for pilots)

`admin.hirforyou.ro/dashboard/admin/onboard/connect`

1. Search and select the tenant.
2. Enter the site's **webhook URL**. For the WordPress plugin this is
   `https://<site>/wp-json/hir-connect/v1/webhook`.
3. Click **Activează HIR Connect**. This flips `tenants.delivery_mode` to
   `headless` and registers the outbound webhook endpoint.
4. **Copy the signing secret — it is shown exactly once.** Send it to the
   patron over a secure channel (Signal / encrypted email). If lost, rotate
   it from the tenant's `/dashboard/settings/integrations/webhooks`.

The patron still needs an **API key** for the *outbound push* (site → HIR).
Generate one in their account at
`/dashboard/settings/integrations/api` with the `orders.write` scope, or
let them self-serve via Path B step 6.

### Path B — patron self-serve wizard

`admin.hirforyou.ro/dashboard/onboarding/wizard` (the patron's own login)

Walk steps 1-7. The integration choice lives in **Step 6**:

- **"Am site/aplicație și vreau să trimit eu comenzile prin API"**
  (`api_only`) — auto-provisions a sandbox API key, revealed **once** on
  Step 7. This is the key the WordPress plugin uses.
- `embed_or_api` also provisions a key if they want the floating widget too.

Step 7 ("Activează comenzi") flips the tenant live and shows the key + a
ready-to-paste `curl` example pointing at `/api/public/v1/orders`.

---

## 2. Install + configure the WordPress plugin

1. Build the zip: from `integrations/wordpress/hir-connect/` run
   `./package.sh` → `hir-connect.zip`.
2. WP admin → **Plugins → Add New → Upload Plugin** → choose the zip →
   **Activate**.
3. **Settings → HIR Connect**:
   - **API key** = the `orders.write` key from step 1 (used for the
     outbound push `Authorization: Bearer …`).
   - **Webhook secret** = the signing secret from Path A (used to verify
     `X-HIR-Signature` on inbound status webhooks).
   - **Endpoint** = `https://hiraisolutions.ro` (the restaurant-web origin
     that serves `/api/public/v1/*`). Leave default unless told otherwise.
4. Click **Ping HIR API**. Expect **"Connected to HIR tenant: `<slug>`"**.
   - This calls `GET /api/public/v1/ping`. A red error here means the API
     key is wrong/inactive or the endpoint origin is wrong — fix before
     continuing.

For Elementor-only sites (no WooCommerce): open the order form → Submit
action → **Send to HIR Connect** → map field IDs.

---

## 3. End-to-end smoke test

Run a real order through before opening to customers.

1. On the patron site, place a **test WooCommerce order** with a valid
   delivery address inside an active HIR zone and a phone number.
2. The plugin posts to `POST /api/public/v1/orders` on the WC thank-you
   page. Expect a `201` and an order note: *"HIR Connect: sent to HIR (id …)."*
3. In HIR: the order appears at `/dashboard/orders` with `source =
   EXTERNAL_API`, status `PENDING`, payment `UNPAID` (the site owns
   payment).
4. Dispatch / let it auto-dispatch. As the HIR status advances
   (`CONFIRMED → … → DELIVERED`), HIR pushes `order.status_changed`
   webhooks back to the site; the WC order status follows the mapping in
   the plugin README, and the customer email/tracking card shows the live
   tracking link.

If the order does **not** appear in HIR, check the WC order notes and the
plugin's retry queue (`hir_connect_retry_queue` option) — see Troubleshooting.

---

## 4. Go-live checklist

| Item | Where | Done |
|---|---|---|
| Tenant `delivery_mode = headless` | onboard/connect or wizard | ☐ |
| Outbound webhook URL registered | onboard/connect | ☐ |
| Signing secret delivered to patron | secure channel | ☐ |
| API key (`orders.write`) issued | settings/integrations/api | ☐ |
| Plugin installed + keys pasted | WP admin | ☐ |
| **Ping HIR API** returns the slug | WP settings | ☐ |
| City `is_active` + delivery zone covers it | /admin/cities, /dashboard/zones | ☐ |
| Smoke order lands in /dashboard/orders | this runbook §3 | ☐ |
| Status flows back to WC (tracking link in email) | §3 | ☐ |

---

## 5. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| WC note: *"queued for retry — 400 invalid_request"* | Payload shape / missing required field (firstName, phone ≥ 6, dropoff for delivery, item priceRon) | Ensure billing has first name + phone and a shipping/billing address. The plugin maps WC → the HIR schema; if you forked `build_payload()`, re-check it against the zod schema. |
| WC note: *"queued for retry — HTTP 401"* | API key missing / wrong / inactive, or lacks `orders.write` | Re-issue the key with `orders.write`; paste into WP settings. |
| Orders rejected with HTTP 429 | Per-key rate limit (60 writes/min) | Expected only under flood; otherwise check for a loop double-posting. |
| Inbound status not updating on the site | Signing secret mismatch (`X-HIR-Signature` fails) | Rotate the secret in `/dashboard/settings/integrations/webhooks` and update WP settings to match. |
| **Ping HIR API** shows HTTP 404 | Wrong endpoint origin | Set Endpoint to the restaurant-web origin serving `/api/public/v1/*`. |
| `error_log`: status push failed (404) | Reverse status sync not implemented server-side | Expected — informational only, safe to ignore (see §6). |
| Order created but no immediate tracking link | Tracking URL arrives via webhook, not the create response | Normal — the link appears once HIR assigns a courier and fires `order.status_changed`. |

---

## 6. Known limitation — reverse status sync (WC → HIR)

The plugin tries to push local WC status changes back to HIR via
`PATCH /api/public/v1/orders/{id}/status`. That endpoint is **not yet
implemented**; the call returns `404` and is logged without breaking
checkout. In the deliveryhouse model HIR is the source of truth for the
delivery lifecycle, so this path is informational only. No action needed.

---

## 7. Rollback

To take a tenant out of headless mode:

1. In WP admin, deactivate the HIR Connect plugin (stops outbound pushes).
2. Set `tenants.delivery_mode` back to `full_saas` (DB or an admin action).
   The tenant's HIR dashboard returns to the full sidebar.
3. Optionally deactivate the tenant's API key in
   `/dashboard/settings/integrations/api` so a stale key cannot post.

In-flight orders already in HIR continue through their normal lifecycle —
rollback only stops *new* orders from flowing in.
