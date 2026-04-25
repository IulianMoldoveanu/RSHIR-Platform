'use client';

import { createBrowserSupabase } from '@hir/supabase-types';

let cached: ReturnType<typeof createBrowserSupabase> | null = null;

export function getBrowserSupabase() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error('Supabase env not configured (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY)');
  }
  cached = createBrowserSupabase(url, anon);
  return cached;
}
