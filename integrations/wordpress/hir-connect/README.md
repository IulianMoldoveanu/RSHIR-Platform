# HIR Connect — WordPress + WooCommerce Plugin

Drop-in connector between a WordPress / WooCommerce site and **HIR** (hirforyou.ro) for last-mile delivery, AI cross-sell, and real-time order tracking.

> **Built for the first pilot at [deliveryhouse.ro](https://deliveryhouse.ro)** — a 5-restaurant Brașov chain (200–500 orders/day) running WordPress 6.9.4 + Elementor 3.35.5 + Kadence theme, with optional future WooCommerce. The plugin works **with or without** WooCommerce.

---

## Feature matrix

| Capability                          | WooCommerce       | Elementor Pro Forms | Standalone shortcode |
| ----------------------------------- | ----------------- | ------------------- | -------------------- |
| Order push to HIR                   | Yes (auto)        | Yes (form action)   | n/a                  |
| Status sync (HIR → WP)              | Yes (auto)        | Custom hook         | Custom hook          |
| Tracking link in customer email     | Yes               | n/a                 | n/a                  |
| AI upsell widget                    | Yes (`[hir_upsell]`)  | Yes (place anywhere) | Yes               |
| Tracking embed                      | Yes (`[hir_tracking]`)| Yes              | Yes                  |
| Retry queue on HIR downtime         | Yes               | Yes                 | n/a                  |
| Webhook receiver (HMAC-SHA256)      | Yes               | Yes                 | Yes                  |

---

## Install (3 steps)

1. **Download** `hir-connect.zip` (run `./package.sh` from this folder to build it).
2. In WP admin → **Plugins → Add New → Upload Plugin** → choose ZIP → Activate.
3. **Settings → HIR Connect** → paste the API key + webhook secret from your HIR onboarding email → **Save** → **Ping HIR API**.

That's it for WooCommerce shops.

For Elementor sites without WooCommerce, also open your existing order form → Submit action → choose **Send to HIR Connect** → map field IDs.

---

## Architecture

```
WordPress / WooCommerce site
│
├── HIR_Connect (bootstrap)              ── plugins_loaded
├── HIR_API_Client                       ── wp_remote_* → hirforyou.ro
├── HIR_Settings                         ── Settings → HIR Connect
├── HIR_Webhook_Handler                  ── REST /wp-json/hir-connect/v1/webhook
├── HIR_Upsell                           ── [hir_upsell] + REST upsell-add
├── HIR_WooCommerce                      ── woocommerce_thankyou + status hooks (conditional)
└── HIR_Elementor / HIR_Elementor_Action ── Elementor Pro form action (conditional)
```

### Outbound contract — `POST /api/public/v1/orders`

The body MUST match the server-side zod schema exactly (camelCase keys,
`totals` object, `dropoff` required for delivery). `firstName` must be
non-empty and `phone` ≥ 6 chars or the API returns `400 invalid_request`.

```php
$payload = [
  'external_order_id' => 12345,                  // ignored today; kept for correlation
  'customer' => [
    'firstName' => 'Ion',
    'lastName'  => 'Popescu',
    'phone'     => '+40712345678',
    'email'     => 'ion@example.com',
  ],
  'items' => [
    [ 'name' => 'Pizza Quattro Stagioni', 'qty' => 1, 'priceRon' => 45.00 ],
    [ 'name' => 'Coca-Cola 0.5L',         'qty' => 2, 'priceRon' =>  8.00 ],
  ],
  'totals' => [
    'subtotalRon'    => 61.00,
    'deliveryFeeRon' =>  0.00,
    'totalRon'       => 61.00,
  ],
  'fulfillment' => 'DELIVERY',                    // DELIVERY | PICKUP
  'dropoff' => [
    'line1' => 'Strada Lungă 12, ap 4',
    'line2' => '',
    'city'  => 'Brașov',
  ],
  'notes'  => 'Sună la sosire',                   // max 500 chars
  'source' => 'woocommerce',
];
```

Headers:
* `Authorization: Bearer <api_key>`
* `X-HIR-Client: wordpress-plugin`
* `X-HIR-Client-Ver: 1.0.0`

Expected response (`201 Created`):
```json
{
  "order_id": "ord_abc123",
  "public_track_token": "tok_abc123"
}
```

> The create response does **not** include `tracking_url` / `eta_minutes` —
> a courier is not assigned yet. The tracking URL + ETA arrive later via the
> inbound `order.status_changed` / `order.eta_updated` webhooks below.

### Inbound contract — webhooks → `POST /wp-json/hir-connect/v1/webhook`

Headers:
* `X-HIR-Signature` — `hash_hmac('sha256', raw_body, webhook_secret)` (hex digest)
* `X-HIR-Event` — `order.status_changed | order.eta_updated | order.courier_assigned`
* `X-HIR-Delivery` — unique delivery id (used for 24h idempotency)

Body (status_changed):
```json
{
  "hir_order_id": "ord_abc123",
  "external_order_id": "12345",
  "status": "DELIVERED",
  "tracking_url": "https://hirforyou.ro/track/ord_abc123",
  "eta_minutes": 0
}
```

Status mapping (HIR → WC):
| HIR              | WC                |
| ---------------- | ----------------- |
| CONFIRMED        | processing        |
| PREPARING        | processing        |
| READY            | processing        |
| PICKED_UP        | out-for-delivery  |
| OUT_FOR_DELIVERY | out-for-delivery  |
| DELIVERED        | completed         |
| CANCELLED        | cancelled         |
| FAILED           | failed            |

Unknown events return `404 unknown_event` and fire `hir_connect_unknown_event` action for theme/plugin hooks.

### Known limitation — reverse status sync (WC → HIR)

`HIR_WooCommerce::on_status_changed()` calls
`PATCH /api/public/v1/orders/{id}/status` to push **local** WC status
changes back to HIR. That server endpoint is **not yet implemented** — the
call returns `404` and is logged via `error_log` without breaking checkout
or the customer flow. In the deliveryhouse model HIR owns the delivery
lifecycle and is the source of truth, so this reverse path is informational
only. It will be wired up when the public API exposes an order-status
mutation. Until then, ignore the `error_log` line for status pushes.

---

## Hooks for theme / plugin developers

```php
// Fires after HIR webhook confirms a status change.
do_action( 'hir_connect_order_status_changed',
    $status,            // HIR status string
    $external_order_id, // local order id
    $hir_order_id,
    $payload            // full body
);

do_action( 'hir_connect_eta_updated',      $external_order_id, $eta_minutes, $payload );
do_action( 'hir_connect_courier_assigned', $external_order_id, $courier_name, $payload );
do_action( 'hir_connect_unknown_event',    $event_name, $payload );
```

---

## Shortcodes

* `[hir_upsell title="You might also like"]` — calls `/api/public/v1/upsell-suggest`, renders 3 cross-sell cards.
* `[hir_tracking order_id="ord_abc123" height="600"]` — iframe of the HIR tracking page. On WC `order-received` pages, `order_id` is auto-detected.

---

## Security

* Nonces (`wp_nonce_field`) on every admin form.
* `current_user_can('manage_options')` capability check on all admin actions.
* All output escaped (`esc_html`, `esc_attr`, `esc_url`).
* All input sanitized (`sanitize_text_field`, `sanitize_email`, `esc_url_raw`).
* Webhook signatures verified with `hash_equals` (constant-time).
* `wp_safe_redirect` on every redirect.
* Idempotency on inbound webhooks (24h transient on delivery id).

---

## Resilience

* HTTP timeout: 10 seconds (`HIR_API_Client::TIMEOUT_SECONDS`).
* Failed order pushes → queued in `hir_connect_retry_queue` option, retried hourly via WP cron, max 5 attempts.
* Customer flow never breaks if HIR is down — WC checkout completes, order is queued, customer sees their normal thank-you page.

---

## Packaging

```bash
./package.sh
# → produces hir-connect.zip ready for WP admin upload
```

---

## Screenshots

Placeholders (to be replaced with real screenshots once installed on a pilot site):

1. **Settings page** — `screenshots/01-settings.png`
2. **Checkout with upsell** — `screenshots/02-upsell-checkout.png`
3. **Order tracking** — `screenshots/03-tracking.png`
4. **WooCommerce order email** — `screenshots/04-email.png`

---

## License

GPL-2.0-or-later. Plugin metadata and code structure follow WordPress Plugin Directory conventions.
