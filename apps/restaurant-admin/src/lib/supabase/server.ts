// TODO(RSHIR-5): Replace with the canonical SSR client wired through
// @supabase/ssr + Next cookies(). This stub is enough for the menu module to
// typecheck and import correctly.
import { cookies } from 'next/headers';
import { createServerClient as createSsrClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

export function createServerClient(): SupabaseClient {
  const cookieStore = cookies();
  return createSsrClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    },
  );
}
