import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ConnectTrackClient } from './ConnectTrackClient';

export const dynamic = 'force-dynamic';

// HIR Connect lean tracker: surfaces only the courier_orders side (delivery layer).
// Items / payment / receipt belong to the partner's own site (deliveryhouse.ro et al).
// Anonymous; auth signal is the token in the URL.
export default async function ConnectTrackPage(
  props: { params: Promise<{ ctoken: string }> },
) {
  const params = await props.params;
  const parsed = z.string().min(8).max(128).safeParse(params.ctoken);
  if (!parsed.success) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <ConnectTrackClient ctoken={parsed.data} />
    </main>
  );
}
