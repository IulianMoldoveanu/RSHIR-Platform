import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient as createSsrClient, type CookieOptions } from '@supabase/ssr';

const PUBLIC_PATHS = ['/login', '/signup', '/_next', '/favicon.ico', '/api/auth', '/api/signup'];

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
    return NextResponse.redirect(redirect);
  }

  if (user && pathname === '/login') {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/dashboard';
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
