import Link from 'next/link';
import type { ReactNode } from 'react';

const navItems = [
  { href: '/menu', label: 'Meniu' },
  { href: '/zones', label: 'Zone livrare' },
  { href: '/analytics', label: 'Analytics' },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="text-sm font-semibold tracking-tight">HIR Admin</div>
          <nav className="flex gap-1 text-sm">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
