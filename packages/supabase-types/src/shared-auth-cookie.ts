/**
 * Cookie scope for the one HIR session that spans more than one host.
 *
 * The staff apps live on two subdomains — app.hirforyou.ro (fleet home,
 * tariffs, couriers) and curier/courier.hirforyou.ro (dispatch, orders,
 * payouts, live map) — and a fleet manager moves between them constantly.
 * By default `@supabase/ssr` writes its auth cookie with no `domain`, which
 * scopes it to the exact host that wrote it, so signing in on one left the
 * other asking for a password again.
 *
 * Both middlewares already passed `domain: '.hirforyou.ro'` when they wrote a
 * cookie (since 2026-06-15), but a middleware only writes on a token refresh.
 * Sign-in itself happens in the browser via `signInWithPassword`, which wrote
 * a host-scoped cookie — so the intended SSO worked only by accident, after a
 * refresh happened to land. This closes that gap at the source.
 *
 * Deliberately opt-in. The storefront (restaurant-web) serves one host per
 * tenant — foisorul-a.hirforyou.ro and the rest — and must NOT share a
 * customer session across them, so it keeps the host-default scope.
 */

const SHARED_SUFFIX = '.hirforyou.ro';
const SHARED_DOMAIN = '.hirforyou.ro';

/**
 * `{ domain }` for a host that should share the session, `{}` otherwise.
 *
 * Only real hirforyou.ro hosts qualify. localhost keeps host scope so dev
 * ports stay isolated, and `*.vercel.app` previews MUST keep it too: vercel.app
 * is on the Public Suffix List, so a browser rejects a cookie scoped to it and
 * the preview would not be able to log in at all.
 */
export function sharedAuthCookieOptions(host: string | null | undefined): { domain?: string } {
  if (!host) return {};
  const bare = host.split(':')[0].trim().toLowerCase();
  if (bare === 'hirforyou.ro' || bare.endsWith(SHARED_SUFFIX)) {
    return { domain: SHARED_DOMAIN };
  }
  return {};
}

/**
 * Every cookie scope a sign-out has to expire, as overlays to merge onto the
 * options `@supabase/ssr` hands us.
 *
 * Expiring only the shared scope is not enough. Anyone already signed in when
 * the shared cookie shipped holds a HOST-scoped cookie, and a removal carrying
 * `domain=.hirforyou.ro` does not touch it: their access token survives
 * logout, the middleware still sees a valid user, and it sends them straight
 * back into the dashboard — logout looks broken. So a removal clears the
 * shared copy AND the host-scoped one. Expiring a cookie that is not there is
 * a no-op, which makes this safe to keep after the migration.
 *
 * `domain: undefined` is deliberate rather than an omission: it overrides any
 * domain in the incoming options so the second write really is host-scoped.
 */
export function authCookieRemovalScopes(
  scope: { domain?: string } | undefined,
): Array<{ domain?: string }> {
  if (!scope?.domain) return [{ domain: undefined }];
  return [{ domain: scope.domain }, { domain: undefined }];
}

/**
 * Names of the Supabase auth cookies currently present, as the browser sees
 * them. Used to clear the host-scoped leftovers from before this change.
 */
export function supabaseAuthCookieNames(cookieHeader: string): string[] {
  return cookieHeader
    .split(';')
    .map((c) => c.split('=')[0].trim())
    .filter((n) => n.startsWith('sb-') && n.includes('-auth-token'));
}

/**
 * Drop the host-scoped copy of every Supabase auth cookie.
 *
 * Writing the domain-scoped cookie does not replace a host-scoped one of the
 * same name — the browser keeps both and sends both, and which one wins when
 * the library parses `document.cookie` is not something we get to decide. A
 * delete without `domain` targets the host-scoped entry specifically, leaving
 * the shared one alone. Call it right before signing in, so a stale cookie
 * from before this change cannot shadow the new session.
 */
export function clearHostScopedAuthCookies(): void {
  if (typeof document === 'undefined') return;
  for (const name of supabaseAuthCookieNames(document.cookie)) {
    document.cookie = `${name}=; Max-Age=0; path=/`;
  }
}
