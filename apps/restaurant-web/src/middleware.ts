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
  const tenantParam = request.nextUrl.searchParams.get('tenant');
  const tenantCookie = request.cookies.get('selected_tenant')?.value;
  const effectiveTenant =
    tenantParam?.trim().toLowerCase() || tenantCookie?.trim().toLowerCase() || null;
  if (effectiveTenant) {
    requestHeaders.set('x-hir-tenant-override', effectiveTenant);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  if (tenantParam) {
    response.cookies.set('selected_tenant', tenantParam.trim().toLowerCase(), {
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
