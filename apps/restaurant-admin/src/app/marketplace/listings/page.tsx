// B2B Marketplace foundation 2026-06-16 — NOT YET LIVE
// Strategy Master Plan Section 5. Gated by HIR_FEATURE_MARKETPLACE_ENABLED.
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function Page() {
  if (process.env.HIR_FEATURE_MARKETPLACE_ENABLED !== 'true') notFound();
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Marketplace — Listings</h1>
      <p className="mt-2 text-slate-600">În curs de construcție...</p>
    </main>
  );
}
