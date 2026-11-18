'use client';

import { createBrowserSupabase, sharedAuthCookieOptions } from '@hir/supabase-types';

let cached: ReturnType<typeof createBrowserSupabase> | null = null;

export function getBrowserSupabase() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error('Supabase env not configured (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY)');
  }
  // One session across app.hirforyou.ro and curier.hirforyou.ro: a fleet
  // manager moves between the two all day and was being asked to sign in
  // twice. Host-default scope is kept off hirforyou.ro (localhost, previews).
  const scope = sharedAuthCookieOptions(
    typeof window === 'undefined' ? null : window.location.hostname,
  );
  cached = createBrowserSupabase(url, anon, scope.domain ? scope : undefined);
  return cached;
}
