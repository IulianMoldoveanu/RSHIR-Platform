import { notFound } from 'next/navigation';
import { resolveTenantFromHost } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const { tenant, host } = await resolveTenantFromHost();

  if (!tenant) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-3 px-6 py-16">
      <p className="text-xs uppercase tracking-widest text-zinc-400">HIR Restaurant</p>
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        Hello, {tenant.name}!
      </h1>
      <p className="text-sm text-zinc-600">
        Esti pe domeniul: <span className="font-mono">{host}</span>
      </p>
      <p className="text-xs text-zinc-400">
        Sprint 2 va construi meniul, cosul si checkout-ul.
      </p>
    </main>
  );
}
