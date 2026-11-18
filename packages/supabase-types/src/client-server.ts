import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Database } from './database.types';
import { authCookieRemovalScopes } from './shared-auth-cookie';

/**
 * Cookie store contract that the server-client expects. Next.js's `cookies()` helper
 * matches this shape (Next 14+).
 */
export interface CookieStore {
  get(name: string): { value: string } | undefined;
  set?(name: string, value: string, options?: CookieOptions): void;
}

/**
 * Supabase server client for Next.js route handlers / server components.
 * Pass cookies() (mutable in route handlers / server actions, read-only in RSCs;
 * the set() calls are best-effort and silently caught when running in an RSC).
 */
export function createServerSupabase(
  supabaseUrl: string,
  supabaseAnonKey: string,
  cookies: CookieStore,
  cookieOptions?: CookieOptions,
) {
  // Merged into every write, including the refresh-token rotation, so a
  // session that starts shared stays shared instead of being narrowed back to
  // one host the first time the server touches it.
  const scope = cookieOptions ?? {};
  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string): string | undefined {
        return cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions): void {
        try {
          cookies.set?.(name, value, { ...options, ...scope });
        } catch {
          // server components can't mutate cookies; that's OK
        }
      },
      remove(name: string, options: CookieOptions): void {
        // Clears the shared copy and the host-scoped leftover, so a logout
        // during the migration actually logs the person out.
        for (const removal of authCookieRemovalScopes(scope)) {
          try {
            cookies.set?.(name, '', { ...options, ...removal, maxAge: 0 });
          } catch {
            // server components can't mutate cookies; that's OK
          }
        }
      },
    },
  });
}
