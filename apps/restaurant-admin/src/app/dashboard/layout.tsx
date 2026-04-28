import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getActiveTenant } from '@/lib/tenant';

// MINIMAL diagnostic layout — strip everything to isolate the throw
// that produces digest 1637498664 on /dashboard/*. PRs #14, #16, #17, #18
// all left the digest alive. This is the next pass — render bare-bones
// shell with the tenant name, nothing else. If THIS works, the bug is
// inside SidebarNav / MobileSidebar / TenantSelector / form actions.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  let active: Awaited<ReturnType<typeof getActiveTenant>>;
  try {
    active = await getActiveTenant();
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (msg.includes('Unauthenticated')) redirect('/login');
    if (msg.includes('not a member')) redirect('/signup');
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
        <div className="rounded-xl border border-rose-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-base font-semibold text-zinc-900">Eroare layout</h1>
          <pre className="mt-3 max-w-md overflow-x-auto rounded bg-zinc-50 p-3 text-left text-xs">
            {msg}
          </pre>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4">
        <span className="text-sm font-semibold">HIR Admin · {active.tenant.name}</span>
        <span className="text-xs text-zinc-500">{active.user.email}</span>
      </header>
      <main className="px-4 py-6">{children}</main>
    </div>
  );
}
