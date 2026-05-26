import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient as createSsrClient, type CookieOptions } from '@supabase/ssr';
import { safeRedirectPath } from '@/lib/safe-redirect';

// Display Mode (kiosk tablet in restaurant) bootstraps with a PIN, not a
// Supabase session. /display/[tenantSlug] + /api/display/** must bypass the
// session redirect so the PIN flow can run on a fresh tablet.
// /api/orders/[id]/display-pickup is the kiosk-side self-pickup endpoint;
// it authenticates inside the route via the display session cookie.
const PUBLIC_PATHS = ['/login', '/register', '/_next', '/favicon.ico', '/api/external', '/api/healthz', '/api/version', '/manifest.webmanifest', '/icon-', '/api/display', '/display'];

/**
 * Auth guard for the courier PWA. /dashboard/** requires a Supabase session;
 * /api/external/** is public (Bearer-token authenticated inside the route).
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic && pathname !== '/login' && pathname !== '/register') {
    return NextResponse.next();
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createSsrClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string): string | undefined {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions): void {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions): void {
          response.cookies.set({ name, value: '', ...options });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/login';
    // Preserve the original path as ?next= so the login page can send the
    // courier back where they came from after a successful sign-in.
    redirect.searchParams.set('next', pathname);
    return NextResponse.redirect(redirect);
  }

  if (user && (pathname === '/login' || pathname === '/register')) {
    const redirect = request.nextUrl.clone();
    // Honour a pre-existing ?next= when redirecting an already-authenticated
    // user away from the login page (e.g. deep-link with session already live).
    const next = safeRedirectPath(request.nextUrl.searchParams.get('next'));
    redirect.pathname = next;
    redirect.search = '';
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon-).*)'],
};
