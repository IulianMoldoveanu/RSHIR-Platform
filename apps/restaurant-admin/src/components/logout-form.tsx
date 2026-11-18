'use client';

import { clearHostScopedAuthCookies } from '@hir/supabase-types';

/**
 * The logout form, with the one thing a server action cannot do for itself.
 *
 * A sign-out has to clear two possible cookies: the shared `.hirforyou.ro`
 * one, and the host-scoped copy anyone already signed in was carrying before
 * the shared cookie shipped. The server can only clear one of them — Next
 * keys response cookies by name, so two same-name writes collapse into a
 * single Set-Cookie header and the last one wins. Left alone, the other
 * session stays valid and the middleware sends the person right back in.
 *
 * `document.cookie` can target the scopes separately: a delete without
 * `domain` hits the host-scoped entry and leaves the shared one alone. So the
 * browser clears that one here, on submit, and the server action clears the
 * shared one as usual. Both gone, one request.
 *
 * Without JavaScript the form still posts and still signs the person out of
 * the shared session; only a pre-migration host-scoped cookie would survive.
 */
export function LogoutForm({
  action,
  className,
  children,
}: {
  action: () => void | Promise<void>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={() => {
        clearHostScopedAuthCookies();
      }}
    >
      {children}
    </form>
  );
}
