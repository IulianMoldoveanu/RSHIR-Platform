import { NextResponse, type NextRequest } from 'next/server';

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

export function middleware(request: NextRequest) {
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

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  if (validParam) {
    response.cookies.set('selected_tenant', validParam, {
      path: '/',
      sameSite: 'lax',
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

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
