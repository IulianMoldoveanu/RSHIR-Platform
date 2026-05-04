// SSRF guard for outbound webhook callbacks.
//
// `webhook_callback_url` on `courier_orders` is supplied by an external
// API caller at order creation. Without this guard, that caller could
// point us at internal services — cloud-metadata endpoints
// (169.254.169.254), localhost (Vercel sidecar functions, Postgres,
// Redis), or RFC1918 / RFC4193 ranges that are reachable from the
// serverless runtime but not from the public internet.
//
// Policy:
//   - protocol must be https: (no http, file, ftp, javascript, data, gopher)
//   - hostname must NOT be:
//       * an IP literal (v4 or v6) at all — webhooks must use a DNS name
//       * a hostname that resolves to a literal IP via the URL parser
//         (we check the raw string here; a follow-up DNS-resolution
//         guard at fetch time covers DNS-rebinding)
//       * `localhost` / `*.localhost` / `*.internal`
//   - DNS resolution at fetch time must not return a private/loopback
//     /link-local address (covered separately by `assertPublicHost`).
//
// Combined, an attacker who registers `evil.example.com` -> 10.0.0.5
// (DNS rebinding) is still blocked by `assertPublicHost`; an attacker
// who tries `https://10.0.0.5/...` directly is blocked here.

const BLOCKED_HOSTNAME_SUFFIXES = [
  '.localhost',
  '.internal',
  '.local',
];
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
]);

const IPV4_LITERAL = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_LITERAL = /^\[?[0-9a-f:]+\]?$/i;

export type UrlSafetyResult =
  | { ok: true; url: URL }
  | { ok: false; error: string };

export function validateWebhookUrl(raw: string): UrlSafetyResult {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: 'webhook_url_invalid' };
  }
  if (u.protocol !== 'https:') {
    return { ok: false, error: 'webhook_url_must_be_https' };
  }
  const host = u.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, error: 'webhook_url_host_blocked' };
  }
  for (const suffix of BLOCKED_HOSTNAME_SUFFIXES) {
    if (host.endsWith(suffix)) {
      return { ok: false, error: 'webhook_url_host_blocked' };
    }
  }
  if (IPV4_LITERAL.test(host)) {
    return { ok: false, error: 'webhook_url_must_use_dns_name' };
  }
  // URL parser strips brackets; bare hex+colons indicates IPv6 literal.
  if (host.includes(':') || IPV6_LITERAL.test(host)) {
    return { ok: false, error: 'webhook_url_must_use_dns_name' };
  }
  return { ok: true, url: u };
}

// Private / loopback / link-local / cloud-metadata IPv4 ranges — used
// at fetch time after DNS resolution to catch DNS-rebinding attacks
// where a public name resolves to an internal address.
//
// Returns true if the address is NOT safe to call.
export function isPrivateIpv4(addr: string): boolean {
  const m = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true;            // 10.0.0.0/8
  if (a === 127) return true;           // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + AWS/GCP metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 0) return true;             // 0.0.0.0/8
  if (a >= 224) return true;            // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false;
}

// IPv6 equivalents — loopback, link-local, unique-local, mapped v4.
export function isPrivateIpv6(addr: string): boolean {
  const lower = addr.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80:')) return true;          // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA fc00::/7
  if (lower.startsWith('::ffff:')) {
    // IPv4-mapped — apply v4 check on the trailing octets.
    const tail = lower.slice('::ffff:'.length);
    if (IPV4_LITERAL.test(tail)) return isPrivateIpv4(tail);
  }
  return false;
}
