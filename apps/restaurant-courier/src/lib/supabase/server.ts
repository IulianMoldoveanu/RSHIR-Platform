import { headers } from 'next/headers';
import { cookies } from 'next/headers';
import { createServerSupabase, sharedAuthCookieOptions } from '@hir/supabase-types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function createServerClient() {
  const cookieStore = await cookies();
  // Same scope the browser client and the middleware use, so a token rotation
  // on the server cannot narrow a shared session back to a single host.
  const host = (await headers()).get('host');
  const scope = sharedAuthCookieOptions(host);
  return createServerSupabase(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    cookieStore,
    scope.domain ? scope : undefined,
  );
}
