// B2B Marketplace foundation 2026-06-16 — NOT YET LIVE
// Strategy Master Plan Section 5. Gated by HIR_FEATURE_MARKETPLACE_ENABLED.
import { notFound } from 'next/navigation';

import { PageHeader, EmptyMarketplaceState } from '@/app/marketplace/_components/ui';

export const dynamic = 'force-dynamic';

export default async function Page() {
  if (process.env.HIR_FEATURE_MARKETPLACE_ENABLED !== 'true') notFound();
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <PageHeader
        eyebrow="HIR · MARKETPLACE"
        title="Ofertele mele"
        description="Urmărește ofertele primite și starea lor din marketplace."
        variant="hero"
      />
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm md:p-12">
        <EmptyMarketplaceState
          title="Construim acest ecran"
          description="Ecranul de oferte al marketplace-ului este în curs de construcție. Revino în curând."
        />
      </div>
    </main>
  );
}
