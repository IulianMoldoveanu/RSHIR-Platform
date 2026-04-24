import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

/**
 * Supabase browser client (Next.js client components).
 * Pass the public anon key only — service role MUST NOT leak to the browser.
 */
export function createBrowserSupabase(supabaseUrl: string, supabaseAnonKey: string) {
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
