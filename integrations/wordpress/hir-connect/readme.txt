=== HIR Connect ===
Contributors: hir
Tags: woocommerce, delivery, courier, restaurant, elementor, ai, upsell, tracking
Requires at least: 5.8
Tested up to: 6.9
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Drop-in connector between your WordPress / WooCommerce restaurant site and HIR — last-mile delivery, AI cross-sell, real-time tracking.

== Description ==

HIR Connect ties your WordPress site to **HIR** (hirforyou.ro) so that every order — whether it comes through WooCommerce checkout, an Elementor Pro form, or a shortcode — gets dispatched to a courier, tracked end-to-end, and surfaced back to your customer.

**Built for two kinds of sites:**

* **WooCommerce shops** — orders sync automatically on the thank-you page; status changes propagate both ways.
* **Elementor / Kadence brochure sites** (no WooCommerce) — a custom "Send to HIR Connect" Elementor Pro form action captures orders.

**Features**

* Order push on checkout (WooCommerce) or on form submit (Elementor Pro)
* Real-time order status webhook receiver (HMAC-SHA256 verified)
* HIR tracking link in customer order emails + My Account
* `[hir_upsell]` shortcode — 3 AI cross-sell suggestions on the cart/checkout
* `[hir_tracking order_id="..."]` shortcode — embedded courier map
* Retry queue (WP cron) — orders are never lost if HIR is briefly unreachable
* WP admin settings page with "Test connection" button
* Romanian + English translations included

== Installation ==

1. Upload the ZIP via **Plugins → Add new → Upload Plugin**.
2. Activate **HIR Connect**.
3. Go to **Settings → HIR Connect** and paste the **API key** + **Webhook secret** from your HIR onboarding email.
4. Click **Ping HIR API** — you should see "Connected to HIR tenant: …".
5. (WooCommerce sites) — that's it. Place a test order.
6. (Elementor sites) — open your order form, change the Submit action to **Send to HIR Connect**, and map field IDs in the new action settings panel.

== Frequently Asked Questions ==

= Does this work without WooCommerce? =

Yes. The plugin auto-detects WooCommerce. Without WC, use the **Elementor Pro Form action** ("Send to HIR Connect") or post to the REST endpoint directly.

= What happens if HIR is down when a customer checks out? =

The order is queued in the WP options table and retried hourly via WP cron (up to 5 attempts). Your customer is never blocked.

= How are webhooks secured? =

Every inbound webhook is verified with `hash_equals( hash_hmac('sha256', body, secret), header )`. Duplicate delivery IDs are rejected for 24h.

= Where is data stored? =

Settings live in WP options. WC orders get HIR metadata (`_hir_order_id`, `_hir_tracking_url`, `_hir_eta_minutes`, `_hir_courier_name`).

== Screenshots ==

1. Settings page — Settings → HIR Connect.
2. WooCommerce checkout with upsell widget.
3. Customer order email with HIR tracking link.
4. My Account → Orders with embedded tracking.

== Changelog ==

= 1.0.0 =
* Initial release: WooCommerce + Elementor Pro Forms integration, webhooks, upsell, tracking, RO/EN translations.

== Upgrade Notice ==

= 1.0.0 =
First release.
