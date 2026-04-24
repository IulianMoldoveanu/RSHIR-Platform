import { cookies } from 'next/headers';
import { createServerSupabase } from '@hir/supabase-types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function createServerClient() {
  return createServerSupabase(SUPABASE_URL, SUPABASE_ANON_KEY, cookies());
}
