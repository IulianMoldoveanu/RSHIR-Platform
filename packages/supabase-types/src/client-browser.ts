import { createBrowserClient, type CookieOptions } from '@supabase/ssr';
import type { Database } from './database.types';

/**
 * Supabase browser client (Next.js client components).
 * Pass the public anon key only — service role MUST NOT leak to the browser.
 *
 * `cookieOptions` is how a caller widens the auth cookie's scope. Sign-in
 * happens here, in the browser, so this is the call that decides whether a
 * session is readable on a sibling subdomain — see sharedAuthCookieOptions().
 * Left out, the cookie keeps the host-default scope, which is what the
 * per-tenant storefront needs.
 */
export function createBrowserSupabase(
  supabaseUrl: string,
  supabaseAnonKey: string,
  cookieOptions?: CookieOptions,
) {
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
    ...(cookieOptions ? { cookieOptions } : {}),
  });
}
