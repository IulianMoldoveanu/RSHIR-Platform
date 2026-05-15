import type { ReactNode } from 'react';
import Link from 'next/link';
import { requirePlatformAdmin } from '@/lib/platform-admin';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Throws redirect to /dashboard if not platform admin.
  await requirePlatformAdmin();

  return (
    <div className="flex min-h-screen flex-col bg-hir-bg text-hir-fg">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-hir-border bg-hir-bg/95 px-4 backdrop-blur">
        <Link href="/admin/fleets" className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500 text-xs font-bold text-white"
          >
            H
          </span>
          <span className="text-sm font-semibold tracking-tight text-hir-fg">HIR Admin</span>
        </Link>
        <span className="rounded-full bg-violet-900/60 px-2 py-0.5 text-[10px] font-medium text-violet-300">
          PLATFORM_ADMIN
        </span>
        <div className="flex-1" />
        <Link
          href="/dashboard"
          className="rounded-md border border-hir-border bg-hir-surface px-2.5 py-1.5 text-xs font-medium text-hir-fg hover:bg-hir-border"
        >
          Înapoi la curier
        </Link>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-8">{children}</main>
    </div>
  );
}
