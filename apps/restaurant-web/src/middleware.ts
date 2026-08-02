import { NextResponse, type NextRequest } from 'next/server';
import { allowedEmbedOrigins } from '@/lib/embed-origins';

/**
 * Host-based tenant routing.
 *
 * - Strip the port (`tenant1.lvh.me:3000` → `tenant1.lvh.me`).
 * - Pass the resolved host through to the page via `x-hir-host`.
 * - Pass the leading subdomain label as a hint via `x-hir-tenant-slug`.
 *
 * The actual tenant lookup (custom_domain → slug fallback) happens in the page,
 * not here, because the middleware runs on the Edge runtime and we want to keep
 * the Supabase server client on the Node runtime where cookies() works fully.
 */
// Same shape as Supabase tenant slug column: lowercase alphanum + hyphens,
// 2–64 chars, must start and end with alphanum. Validated before persisting
// to selected_tenant so a typo like `?tenant=fooo` does not poison the cookie
// for 7 days and trap the visitor in repeated 404s.
const TENANT_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export async function middleware(request: NextRequest) {
  const rawHost = request.headers.get('host') ?? '';
  const host = rawHost.split(':')[0];
  const slug = host.split('.')[0];

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-hir-host', host);
  requestHeaders.set('x-hir-host-with-port', rawHost);
  requestHeaders.set('x-hir-tenant-slug', slug);

  // Preview-host tenant override: on Vercel auto-generated URLs and local
  // dev, accept ?tenant=<slug> as the chosen tenant. resolveTenantFromHost
  // gates the override to non-canonical hosts so end-users on the real
  // production domain can't switch tenants by URL.
  // Cookie fallback persists the choice across in-app navigation that
  // drops the query string (e.g. /checkout, /rezervari links).
  const tenantParam = request.nextUrl.searchParams.get('tenant')?.trim().toLowerCase() || null;
  const tenantCookie = request.cookies.get('selected_tenant')?.value?.trim().toLowerCase() || null;

  const validParam = tenantParam && TENANT_SLUG_RE.test(tenantParam) ? tenantParam : null;
  const validCookie = tenantCookie && TENANT_SLUG_RE.test(tenantCookie) ? tenantCookie : null;
  const effectiveTenant = validParam || validCookie;
  if (effectiveTenant) {
    requestHeaders.set('x-hir-tenant-override', effectiveTenant);
  }

  // Lane Y5 (2026-05-05) — embeddable storefront widget. Iframe URL is
  // /?tenant=<slug>&embed=1; the param can drop on in-app navigation
  // (e.g. /checkout, /track/<token>), so we persist `hir_embed=1` for the
  // session so all downstream pages know they're rendering inside an
  // embed iframe and can hide chrome + emit `parent.postMessage` on
  // checkout success. 1-hour TTL keeps it from polluting later visits
  // when the user opens the same browser to the canonical site.
  const embedParam = request.nextUrl.searchParams.get('embed')?.trim() === '1';
  const embedCookie = request.cookies.get('hir_embed')?.value === '1';
  const isEmbed = embedParam || embedCookie;
  if (isEmbed) {
    requestHeaders.set('x-hir-embed', '1');
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  if (validParam) {
    response.cookies.set('selected_tenant', validParam, {
      path: '/',
      sameSite: 'lax',
      // S7: gate on prod so `Secure` doesn't break local dev over http://lvh.me.
      // In production all canonical hosts are HTTPS, so the cookie must be
      // marked Secure to prevent it from being sent over an accidental
      // http:// downgrade. httpOnly stays false — the storefront reads the
      // cookie in client code to render the current tenant badge.
      secure: process.env.NODE_ENV === 'production',
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 7,
    });
  } else if (tenantParam && !validParam) {
    // Explicit ?tenant= with garbage clears any stale cookie so the user
    // does not stay routed to a dead tenant on subsequent navigation.
    response.cookies.delete('selected_tenant');
  } else if (tenantCookie && !validCookie) {
    response.cookies.delete('selected_tenant');
  }

  if (embedParam) {
    // SameSite=None+Secure required because the cookie is read inside a
    // cross-origin iframe (host page is the merchant's own domain).
    response.cookies.set('hir_embed', '1', {
      path: '/',
      sameSite: 'none',
      secure: true,
      httpOnly: false,
      maxAge: 60 * 60,
    });
  }

  // Framing + CSP. Owned here rather than in next.config.mjs because the
  // decision depends on `isEmbed`, which comes from the query param on the
  // first load and from the `hir_embed` cookie on every navigation after it —
  // a static config rule can only see the query string.
  //
  // 2026-08-02, confirmed empirically: the previous blanket
  // `X-Frame-Options: SAMEORIGIN` in next.config.mjs broke the embed widget
  // outright. Loading the widget's iframe from any merchant domain produced
  // "Refused to display 'https://hirforyou.ro/' in a frame because it set
  // 'X-Frame-Options' to 'sameorigin'". SAMEORIGIN is just as fatal as DENY
  // for third-party framing — the config comment claiming otherwise was wrong.
  //
  // Only the embed surface is framable, and only while embed mode is active;
  // everything else (marketing pages, checkout, /account, /track) stays
  // same-origin-only, which is stricter than what shipped before.
  //
  // 2026-08-02 (follow-up): embed mode used to widen this to
  // `frame-ancestors *` — any site on the internet could frame a checkout
  // surface. It now resolves the tenant's actual allow-list (verified
  // custom_domain + `settings.embed.allowed_origins`); a tenant that has
  // registered nothing gets no third-party framing at all. The lookup is
  // cached and only runs on embed requests, so ordinary traffic pays nothing
  // for it, and it fails closed on any error.
  //
  // The rest of the policy is the subset that is safe to enforce without
  // nonces: it blocks <base> hijacking, plugin content and form posts to
  // foreign origins. Verified safe for payments — the PSP hand-off is a
  // `window.location.href` navigation, not a form POST, so `form-action`
  // never sees it. script-src/style-src are deliberately NOT set yet: Next's
  // hydration bootstrap is inline, so those need nonce plumbing and a
  // report-only bake first.
  // The `?tenant=` override only picks the rendered tenant on preview hosts
  // (isPreviewHost in lib/tenant.ts). Honouring it here on the canonical host
  // too would let one tenant's registered partner frame a page that tenant
  // doesn't own — /account on the apex, say. Same gate, so the framing rules
  // always follow the tenant that actually renders.
  const previewHost =
    host.endsWith('.vercel.app') || host === 'localhost' || host.endsWith('.lvh.me');
  const frameAncestors = isEmbed
    ? ["'self'", ...(await allowedEmbedOrigins(host, previewHost ? effectiveTenant : null))].join(' ')
    : "'self'";
  const csp = [
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
    'upgrade-insecure-requests',
  ].join('; ');
  response.headers.set('Content-Security-Policy', csp);
  if (frameAncestors === "'self'") {
    // Kept alongside frame-ancestors for browsers that honour only the older
    // header — including when the request IS in embed mode but the tenant has
    // registered no third-party origins, where the two agree anyway.
    // Omitted the moment a third party is allowed: X-Frame-Options has no
    // "allow this specific origin" value, so any value at all would re-break
    // the widget.
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
