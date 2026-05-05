import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient as createSsrClient, type CookieOptions } from '@supabase/ssr';

// `/api/healthz` + `/api/version` are public so external uptime monitors and
// release-watchers can probe without auth.
const PUBLIC_PATHS = ['/login', '/signup', '/_next', '/favicon.ico', '/api/auth', '/api/signup', '/api/healthz', '/api/version'];

/**
 * Auth guard: any /dashboard/* path requires a Supabase session, otherwise
 * redirect to /login. /login itself is public; if the user is already signed in
 * we send them to /dashboard.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic && pathname !== '/login') {
    return NextResponse.next();
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  // Fail loud and readable when the deploy is missing Supabase env vars,
  // instead of letting createSsrClient throw "Cannot read URL of undefined"
  // which surfaces as the opaque "Application error: server-side exception"
  // page on the client. Affects both auth-gated paths and /login.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) {
    console.error(
      '[middleware] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing — preview/prod env not fully configured. Path:',
      pathname,
    );
    return new NextResponse(
      'Server configuration error: Supabase env vars not set on this deployment. ' +
        'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel project settings.',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
  }

  const supabase = createSsrClient(
    supabaseUrl,
    supabaseAnon,
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
    // Preserve the original path so the login page can deep-link back
    // (e.g. /invite/fm/<token>). Skip for /dashboard and / because they
    // are already the default post-login target.
    redirect.search = '';
    if (pathname !== '/dashboard' && pathname !== '/') {
      redirect.searchParams.set('next', pathname + (request.nextUrl.search || ''));
    }
    return NextResponse.redirect(redirect);
  }

  if (user && pathname === '/login') {
    const redirect = request.nextUrl.clone();
    // Forward `?next=<path>` so client-side login can route there.
    const next = request.nextUrl.searchParams.get('next');
    redirect.search = '';
    if (next && next.startsWith('/') && !next.startsWith('//')) {
      redirect.pathname = next;
    } else {
      redirect.pathname = '/dashboard';
    }
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
