# HIR Datecs Companion

Local desktop bridge between HIR (cloud) and a **Datecs** fiscal printer
(FP-700, FP-2000, FMP-350, DP-50 and other FiscalNet-2 family devices)
on the tenant's premises.

> **Status: V1 skeleton.** Use with `DATECS_DRY_RUN=1` for first-time
> setup. Live-printer testing is the responsibility of the tenant
> operator; HIR engineering does not have hands on a physical Datecs
> unit. Every receipt printed is a real fiscal record — handle with
> care.

---

## Why this exists

Datecs FP-700 connects via RS-232 / USB-serial to the local PC. There
is **no cloud API** — HIR (which runs on Vercel + Supabase Edge) cannot
reach the printer directly. This companion runs on the tenant's PC,
exposes a single `/print` HTTPS endpoint over a tunnel, and translates
the HIR webhook envelope into FiscalNet-2 byte sequences on the serial
port.

This is the **D.tunnel** option from
`docs/proposals/DECISION_DATECS_2026-05-07.md`:

- Zero new HIR-side schema.
- Reuses the existing **Custom HTTPS-webhook adapter** (PRs #317 / #320 / #321).
- The tunnel URL is a genuine public HTTPS host, so HIR's SSRF guard
  stays intact (no relaxation needed).

---

## Architecture (one minute)

```
HIR cloud (Vercel + Supabase)
   │
   │  Order DELIVERED (or NEW, READY, CANCELLED — operator picks)
   ▼
integration-bus → integration_events queue
   │
   ▼
integration-dispatcher (Edge Function, every 30s)
   │
   │  POST  https://<random>.trycloudflare.com/print
   │  X-HIR-Signature: <HMAC-SHA256 over body>
   │  X-HIR-Event: order.status_changed
   │  X-HIR-Test-Mode: 0|1
   │  body: { event, test_mode, order, delivered_at }
   ▼
Cloudflare Tunnel (cloudflared) on tenant PC
   │
   ▼
Express on localhost:7890
   │ verifies HMAC signature
   │ builds DatecsReceiptProgram
   │ frames each step into FiscalNet-2 packet
   ▼
SerialPort (COM3 / /dev/ttyUSB0 / /dev/tty.usbserial-...)
   ▼
Datecs FP-700  →  bon fiscal pe rolă termică
```

---

## Install (tenant PC)

Requirements:

- **Node 20+** ([nodejs.org](https://nodejs.org))
- A Datecs printer connected via USB-serial or RS-232 cable, **powered on**
- A free hour to do the first setup

```sh
# 1. Clone or download just this folder.
cd tools/datecs-companion

# 2. Install deps (NOT via pnpm — companion is outside the workspace).
npm install --omit=dev

# 3. Find which COM port the printer is on.
node list-ports.js
# → COM3 | producător: Prolific | VID:067B | PID:2303

# 4. Copy + edit env config.
cp .env.example .env
# (edit .env — paste COMPANION_TOKEN/HIR_WEBHOOK_SECRET from HIR admin,
#  set DATECS_SERIAL_PATH=COM3, leave DATECS_DRY_RUN=1 the first time)

# 5. Start the companion (loads .env automatically if you use a .env loader; see "running" below).
npm start
# → [companion] HIR Datecs companion listening on :7890
# → [companion] dryRun=1 serialPath=COM3 baud=115200
```

> **Note on `.env` loading:** Node 20.6+ supports `node --env-file=.env server.js`.
> On older Node, install `dotenv` and add `import 'dotenv/config'` to the top
> of `server.js`, OR set the env vars manually in your shell before `npm start`.

---

## Expose via tunnel

Pick **one** tunnel. Cloudflare is recommended (free, no signup for
random subdomains, well-tested with Cloudflare's edge).

### Option 1 — Cloudflare Tunnel (recommended)

Free, no account required for the random-subdomain mode.

```sh
# Install cloudflared:
#   Windows:  winget install --id Cloudflare.cloudflared
#   macOS:    brew install cloudflared
#   Linux:    https://pkg.cloudflare.com/

# Start a quick tunnel pointing at the companion:
cloudflared tunnel --url http://localhost:7890

# cloudflared will print a URL like:
#   https://random-words-here.trycloudflare.com
# Paste that URL + "/print" into HIR admin → Integrări → Custom webhook.
# Example webhook URL:  https://random-words-here.trycloudflare.com/print
```

For a **stable** tunnel (paid Cloudflare plan or free with your own
domain), see <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/>.

### Option 2 — ngrok

Free tier rotates the URL on every restart (the tenant must paste the
new URL into HIR admin every time). Paid plan keeps a stable subdomain.

```sh
# Install ngrok: https://ngrok.com/download
ngrok config add-authtoken <YOUR_TOKEN>
ngrok http 7890
# → Forwarding   https://abcd-12-34-56-78.ngrok-free.app  →  http://localhost:7890
# Webhook URL: https://abcd-12-34-56-78.ngrok-free.app/print
```

### Option 3 — Tailscale Funnel

Best for tenants who already use Tailscale. The URL stays stable
(tied to the device's Tailscale name).

```sh
tailscale serve --bg --https=443 --set-path=/print http://localhost:7890/print
tailscale funnel --bg 443 on
# → https://your-machine.tailnet.ts.net/print
```

---

## Configure on HIR side

1. In HIR admin, navigate to **Configurare → Integrări**.
2. Click **Adaugă furnizor**.
3. Pick **Custom** as the provider type.
4. Click the **Datecs FP-700 (companion)** preset button — it pre-fills
   the form with the right placeholder URL pattern + sane defaults
   (DELIVERED-only, 32-hex secret).
5. Replace `https://YOUR-TUNNEL-URL/print` with your real tunnel URL.
6. Confirm the secret in your tenant `.env`'s `COMPANION_TOKEN` and
   `HIR_WEBHOOK_SECRET` matches the one shown in the HIR form.
7. Save.
8. Click **Testează conexiunea** on the new row — companion replies 200,
   no real receipt is printed (`test_mode: true` is honored).
9. Place a real test order on your storefront, change status to
   DELIVERED → companion prints a fiscal receipt.

> ⚠️ **Before live:** Reprogram printer **VAT group B** from 9% to 11%
> via the Datecs service menu (see Datecs RO firmware manual, menu
> 5.3). HoReCa default in HIR = 11% per Legea 141/2025; the printer
> ships with 9% out of the box.

---

## Per-order manual print

If a receipt didn't print (paper out, printer offline, network blip),
the operator can re-trigger it manually from HIR admin:

1. Open the order in **Comenzi → [order #...]**.
2. Click **Tipărește bon fiscal**.
3. HIR re-dispatches the order through the Custom webhook → the
   companion prints it.

The button is OWNER-gated and only appears when at least one Custom
provider is configured for the tenant.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `bad_signature` (403) | HMAC mismatch | Check `HIR_WEBHOOK_SECRET` matches the secret you saved in HIR admin → Integrări → Custom |
| `empty_program` (422) | Order has only 0-RON lines | Expected — companion refuses to print empty receipts |
| `print_failed` → `Error: Resource temporarily unavailable` | Wrong `DATECS_SERIAL_PATH` | Run `node list-ports.js` again |
| Companion gets the request but printer doesn't print | Wrong baud rate | Try 9600, 19200, 38400, 115200 |
| Receipt prints but VAT line shows 9% | Printer not reprogrammed | Datecs service menu → group B → 11% |
| Cloudflare URL changes every restart | Free quick-tunnel mode is ephemeral | Use named tunnel + your domain (free Cloudflare account) |

---

## Security notes

- The companion is **default-off**. Without a running cloudflared process
  the printer is unreachable from the internet.
- The `/print` endpoint requires a valid **HMAC-SHA256** signature on
  the request body in the `X-HIR-Signature` header. Requests without
  it (or with a wrong signature) are rejected with `403 bad_signature`.
- The shared secret lives in HIR's integrations admin (the "Secret
  webhook (HMAC)" field) and in the companion's `HIR_WEBHOOK_SECRET`
  env. They MUST be identical. HIR generates a 32-hex UUID with the
  "Generează" button; paste the same value into the companion `.env`.
- HIR's existing **SSRF guard** stays intact: only HTTPS public hosts
  are accepted, internal/private IPs are blocked. A tunnel URL is
  genuinely public, so the guard does its job without modification.
- The companion does **not** auto-update, does **not** phone home, and
  does **not** persist anything to disk except npm caches.
- Test-mode envelopes (`test_mode: true`) **never** print to the live
  printer — they are ack'd 200 with no fiscal-memory side effect.

---

## License

Proprietary — internal HIR tooling. Distributed only to HIR tenants
under their HIR Master Services Agreement.
