import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logoutAction } from '../dashboard/actions';

export const dynamic = 'force-dynamic';

// Auth gate: the user must be an auth.users row whose id appears in
// partners.user_id with status = 'ACTIVE'. This is entirely separate from
// tenant membership — a partner is NOT a tenant member.

export default async function PartnerPortalLayout({ children }: { children: ReactNode }) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Look up the partner row for this auth user via service-role (RLS is off
  // for partners; anon key would return nothing).
  const admin = createAdminClient() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{
              data: Record<string, unknown> | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };

  const { data: partner, error } = await admin
    .from('partners')
    .select('id, name')
    .eq('user_id', user.id)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (error) {
    console.error('[partner-portal/layout] partner lookup error:', error.message);
  }

  if (!partner) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 text-center">
        <div className="max-w-md rounded-xl border border-amber-200 bg-white p-6 shadow-sm">
          <h1 className="text-base font-semibold text-zinc-900">
            Contul tău nu e încă conectat la un partener
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Contactează administratorul HIR pentru a activa accesul la portalul de partener.
          </p>
          <div className="mt-4 flex justify-center gap-2 text-sm">
            <a
              href="mailto:contact@hiraisolutions.ro"
              className="rounded-md bg-purple-600 px-3 py-2 font-medium text-white hover:bg-purple-700"
            >
              Contactează-ne
            </a>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md border border-zinc-300 px-3 py-2 font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Deconectare
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  const navLinks = [
    { href: '/partner-portal', label: 'Tablou de bord' },
  ];

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside className="hidden w-52 flex-col border-r border-zinc-200 bg-white lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-zinc-200 px-4">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-600 text-xs font-bold text-white"
          >
            H
          </span>
          <span className="text-sm font-semibold tracking-tight text-zinc-900">HIR Partener</span>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2 text-sm">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-2 rounded-md border-l-2 border-transparent px-3 py-2 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 sm:px-6">
          <span className="text-sm font-medium text-zinc-700">
            Portal Partener — {partner.name as string}
          </span>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-zinc-500 md:inline">{user.email}</span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
              >
                Logout
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
